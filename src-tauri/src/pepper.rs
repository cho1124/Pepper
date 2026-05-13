// 핫 페퍼 배지용 슬림 백엔드.
//
// 기존 forensics 모듈을 통째 대체. 페퍼 percentile 계산만을 위해 필요한
// 최소 정보(파일별 score)만 산출. progress 채널/heatmap/trend/contributors 같은
// 부가 기능은 모두 제거.
//
// 큰 레포 가드: count_commits 가 max_commits 를 초과하면 즉시 too_large=true 로
// 빈 결과 반환 — 사용자는 설정에서 직접 페퍼를 활성화한 상태여야 호출됨.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use chrono::{DateTime, Duration, FixedOffset, Utc};
use serde::Serialize;
use tauri::State;

use crate::git::{run_git, with_repo};
use crate::AppState;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const DEFAULT_LIMIT: u32 = 1000;
const DEFAULT_DAYS: u32 = 90;
const DEFAULT_MAX_COMMITS: u32 = 10_000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PepperEntry {
    pub path: String,
    pub score: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PepperResult {
    pub scores: Vec<PepperEntry>,
    /// 가드 초과로 분석을 건너뛴 경우 true. scores 는 빈 벡터.
    pub too_large: bool,
    /// 가드 판정에 쓰인 총 커밋 수 (since=days 범위 안).
    pub total_commits: u32,
}

pub struct CachedPepperScan {
    head: String,
    days: u32,
    result: PepperResult,
}

#[derive(Default)]
struct FileStats {
    changes: u32,
    insertions: u32,
    deletions: u32,
    authors: HashSet<String>,
    last_modified: Option<DateTime<FixedOffset>>,
}

fn current_head(path: &PathBuf) -> Result<String, String> {
    Ok(run_git(path, &["rev-parse", "HEAD"])?.trim().to_string())
}

fn count_commits(path: &PathBuf, since_days: u32) -> Result<u32, String> {
    let since = Utc::now() - Duration::days(since_days as i64);
    let since_arg = format!("--since={}", since.format("%Y-%m-%d"));
    let out = run_git(
        path,
        &["rev-list", "--count", "HEAD", "--no-merges", &since_arg],
    )?;
    out.trim()
        .parse::<u32>()
        .map_err(|e| format!("commit count 파싱 실패: {}", e))
}

fn scan_and_aggregate(
    path: &PathBuf,
    since_days: u32,
) -> Result<HashMap<String, FileStats>, String> {
    let since = Utc::now() - Duration::days(since_days as i64);
    let since_arg = format!("--since={}", since.format("%Y-%m-%d"));

    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(path);
    cmd.args([
        "log",
        "--numstat",
        "--format=COMMIT_SEP%H\x1f%an\x1f%aI",
        "--no-merges",
        &since_arg,
    ]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("git spawn 실패: {}", e))?;
    let stdout = child.stdout.take().ok_or("stdout 없음")?;

    let mut stats: HashMap<String, FileStats> = HashMap::new();
    let mut cur_author: Option<String> = None;
    let mut cur_date: Option<DateTime<FixedOffset>> = None;

    for line_res in BufReader::new(stdout).lines() {
        let line = line_res.map_err(|e| format!("git log 읽기 실패: {}", e))?;
        if let Some(rest) = line.strip_prefix("COMMIT_SEP") {
            let parts: Vec<&str> = rest.splitn(3, '\x1f').collect();
            if parts.len() == 3 {
                cur_author = Some(parts[1].to_string());
                cur_date = DateTime::parse_from_rfc3339(parts[2]).ok();
            } else {
                cur_author = None;
                cur_date = None;
            }
            continue;
        }
        if line.is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.splitn(3, '\t').collect();
        if fields.len() != 3 {
            continue;
        }
        let ins: u32 = if fields[0] == "-" {
            0
        } else {
            fields[0].parse().unwrap_or(0)
        };
        let del: u32 = if fields[1] == "-" {
            0
        } else {
            fields[1].parse().unwrap_or(0)
        };
        let fpath = fields[2].to_string();

        let entry = stats.entry(fpath).or_default();
        entry.changes += 1;
        entry.insertions += ins;
        entry.deletions += del;
        if let Some(a) = &cur_author {
            entry.authors.insert(a.clone());
        }
        if let Some(d) = cur_date {
            if entry.last_modified.map_or(true, |prev| d > prev) {
                entry.last_modified = Some(d);
            }
        }
    }

    let status = child.wait().map_err(|e| format!("git wait 실패: {}", e))?;
    if !status.success() {
        return Err("git log 비정상 종료".to_string());
    }

    Ok(stats)
}

fn days_since(date: DateTime<FixedOffset>) -> i64 {
    Utc::now()
        .signed_duration_since(date.with_timezone(&Utc))
        .num_days()
}

fn compute_scores(stats: HashMap<String, FileStats>, limit: usize) -> Vec<PepperEntry> {
    let mut entries: Vec<PepperEntry> = stats
        .into_iter()
        .map(|(path, s)| {
            let recent = match s.last_modified {
                Some(d) if days_since(d) < 30 => 2_u32,
                _ => 1_u32,
            };
            // forensics 의 score 공식 그대로 유지 (페퍼 percentile 분류 호환).
            let score = (s.changes as f64) * 3.0
                + (s.authors.len() as f64) * 5.0
                + ((s.insertions + s.deletions) as f64) * 0.01
                + (recent as f64) * 10.0;
            PepperEntry {
                path,
                score: (score * 10.0).round() / 10.0,
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    entries.truncate(limit);
    entries
}

#[tauri::command]
pub fn get_pepper_scores(
    limit: Option<u32>,
    days: Option<u32>,
    max_commits: Option<u32>,
    state: State<AppState>,
) -> Result<PepperResult, String> {
    let lim = limit.unwrap_or(DEFAULT_LIMIT) as usize;
    let d = days.unwrap_or(DEFAULT_DAYS);
    let max = max_commits.unwrap_or(DEFAULT_MAX_COMMITS);

    with_repo(&state, |path| {
        let total = count_commits(path, d).unwrap_or(0);
        if total > max {
            return Ok(PepperResult {
                scores: Vec::new(),
                too_large: true,
                total_commits: total,
            });
        }

        let head = current_head(path)?;

        // 캐시 hit
        {
            let cache_guard = state.pepper_cache.lock().map_err(|e| e.to_string())?;
            if let Some(c) = cache_guard.as_ref() {
                if c.head == head && c.days == d {
                    let mut r = c.result.clone();
                    r.scores.truncate(lim);
                    return Ok(r);
                }
            }
        }

        let stats = scan_and_aggregate(path, d)?;
        let scores = compute_scores(stats, lim);
        let result = PepperResult {
            scores,
            too_large: false,
            total_commits: total,
        };

        if let Ok(mut g) = state.pepper_cache.lock() {
            *g = Some(CachedPepperScan {
                head,
                days: d,
                result: result.clone(),
            });
        }

        Ok(result)
    })
}

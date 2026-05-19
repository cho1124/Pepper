use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::State;

use crate::AppState;

/// Windows에서 CMD 창이 뜨지 않도록 DETACHED_PROCESS | CREATE_NO_WINDOW 플래그 적용
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ───── Shared helpers ──────────────────────────

pub fn with_repo<R>(
    state: &State<AppState>,
    f: impl FnOnce(&PathBuf) -> Result<R, String>,
) -> Result<R, String> {
    let guard = state.repo.lock().map_err(|e| e.to_string())?;
    let path = guard.as_ref().ok_or("레포가 열려있지 않습니다")?;
    f(path)
}

pub fn run_git(path: &PathBuf, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(path).args(args);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("git 실행 실패: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ───── DTO ─────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LastCommit {
    hash: String,
    message: String,
    date: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    path: String,
    current_branch: String,
    last_commit: Option<LastCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub hash_short: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub refs: String,
    /// 부모 커밋 해시들 (full SHA, 공백으로 split된 결과)
    pub parents: Vec<String>,
}

#[derive(Serialize)]
pub struct StatusInfo {
    current: String,
    not_added: Vec<String>,
    modified: Vec<String>,
    deleted: Vec<String>,
    staged: Vec<String>,
    conflicted: Vec<String>,
    created: Vec<String>,
    renamed: Vec<String>,
}

#[derive(Serialize)]
pub struct BranchInfo {
    current: String,
    all: Vec<String>,
}

#[derive(Serialize)]
pub struct FileTreeNode {
    name: String,
    path: String,
    #[serde(rename = "type")]
    node_type: String,
    children: Option<Vec<FileTreeNode>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    hash: String,
    summary: serde_json::Value,
}

// ───── Parsers ─────────────────────────────────

fn parse_log(raw: &str) -> Vec<CommitInfo> {
    raw.lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(8, '\x1f').collect();
            if parts.len() != 8 {
                return None;
            }
            let parents: Vec<String> = parts[7]
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            Some(CommitInfo {
                hash: parts[0].to_string(),
                hash_short: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                email: parts[4].to_string(),
                date: parts[5].to_string(),
                refs: parts[6].to_string(),
                parents,
            })
        })
        .collect()
}

// ───── Commands ────────────────────────────────

fn strip_long_path_prefix(p: &str) -> String {
    // Windows canonicalize가 \\?\ prefix를 붙이는 경우 제거
    p.strip_prefix(r"\\?\").unwrap_or(p).to_string()
}

#[tauri::command]
pub fn open_repo(path: String, state: State<AppState>) -> Result<RepoInfo, String> {
    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("경로 확인 실패: {}", e))?;

    run_git(&canonical, &["rev-parse", "--git-dir"])
        .map_err(|_| "Git 레포지토리가 아닙니다".to_string())?;

    let current_branch = run_git(&canonical, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "HEAD".to_string());

    let last_commit = run_git(
        &canonical,
        &["log", "-1", "--pretty=format:%h\x1f%s\x1f%aI"],
    )
    .ok()
    .and_then(|s| {
        let parts: Vec<&str> = s.splitn(3, '\x1f').collect();
        if parts.len() == 3 {
            Some(LastCommit {
                hash: parts[0].to_string(),
                message: parts[1].to_string(),
                date: parts[2].to_string(),
            })
        } else {
            None
        }
    });

    let display_path = strip_long_path_prefix(&canonical.to_string_lossy());
    let repo_name = canonical
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path.clone());
    let info = RepoInfo {
        path: display_path.clone(),
        current_branch,
        last_commit,
    };

    // 최근 레포 기록
    let _ = crate::recent::touch_recent(&display_path, &repo_name);

    {
        let mut guard = state.repo.lock().map_err(|e| e.to_string())?;
        *guard = Some(canonical);
    }

    {
        // 새 레포로 바꿀 때 페퍼 캐시 무효화
        let mut pcache = state
            .pepper_cache
            .lock()
            .map_err(|e| e.to_string())?;
        *pcache = None;
    }

    Ok(info)
}

#[tauri::command]
pub fn get_log(
    max_count: Option<u32>,
    file: Option<String>,
    include_all: Option<bool>,
    state: State<AppState>,
) -> Result<Vec<CommitInfo>, String> {
    with_repo(&state, |path| {
        let max = max_count.unwrap_or(200);
        let max_arg = format!("-{}", max);
        let mut args: Vec<&str> = vec![
            "log",
            &max_arg,
            "--pretty=format:%H\x1f%h\x1f%s\x1f%an\x1f%ae\x1f%aI\x1f%D\x1f%P",
        ];
        // --all 은 --follow(파일 히스토리)와 호환 안 됨 → 파일 모드에선 무시
        if include_all.unwrap_or(false) && file.is_none() {
            args.push("--all");
        }
        let file_ref;
        if let Some(f) = &file {
            args.push("--follow");
            args.push("--");
            file_ref = f.as_str();
            args.push(file_ref);
        }
        let raw = run_git(path, &args)?;
        Ok(parse_log(&raw))
    })
}

#[tauri::command]
pub fn get_status(state: State<AppState>) -> Result<StatusInfo, String> {
    with_repo(&state, |path| {
        let current = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "HEAD".to_string());

        let raw = run_git(path, &["status", "--porcelain=v1"])?;

        let mut info = StatusInfo {
            current,
            not_added: Vec::new(),
            modified: Vec::new(),
            deleted: Vec::new(),
            staged: Vec::new(),
            conflicted: Vec::new(),
            created: Vec::new(),
            renamed: Vec::new(),
        };

        for line in raw.lines() {
            if line.len() < 3 {
                continue;
            }
            let bytes = line.as_bytes();
            let x = bytes[0] as char;
            let y = bytes[1] as char;
            let file = line[3..].to_string();

            if x == '?' && y == '?' {
                info.not_added.push(file);
                continue;
            }

            if x == 'U' || y == 'U' || (x == 'D' && y == 'D') || (x == 'A' && y == 'A') {
                info.conflicted.push(file);
                continue;
            }

            if x != ' ' {
                info.staged.push(file.clone());
                if x == 'A' {
                    info.created.push(file.clone());
                }
                if x == 'R' {
                    info.renamed.push(file.clone());
                }
            }

            match y {
                'M' => info.modified.push(file),
                'D' => info.deleted.push(file),
                _ => {}
            }
        }

        Ok(info)
    })
}

#[tauri::command]
pub fn get_diff(hash: String, state: State<AppState>) -> Result<String, String> {
    with_repo(&state, |path| {
        let parent = format!("{}^", hash);
        run_git(path, &["diff", &parent, &hash])
    })
}

#[tauri::command]
pub fn stage(files: Vec<String>, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        let mut args: Vec<&str> = vec!["add", "--"];
        for f in &files {
            args.push(f.as_str());
        }
        run_git(path, &args)?;
        Ok(())
    })
}

#[tauri::command]
pub fn unstage(files: Vec<String>, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        let mut args: Vec<&str> = vec!["reset", "HEAD", "--"];
        for f in &files {
            args.push(f.as_str());
        }
        run_git(path, &args)?;
        Ok(())
    })
}

/// 변경사항 되돌리기 (discard).
///
/// - tracked (modified/staged): `git reset HEAD --` 로 unstage 후 `git checkout HEAD --` 로 working tree HEAD 복원
/// - untracked (`??`): `include_untracked=true` 일 때만 `git clean -f --` 로 영구 삭제
///
/// Returns: (tracked 처리 개수, untracked 처리 개수, skipped 개수)
#[tauri::command]
pub fn discard_files(
    files: Vec<String>,
    include_untracked: bool,
    state: State<AppState>,
) -> Result<DiscardResult, String> {
    with_repo(&state, |path| {
        // 1) status --porcelain -z 로 분류 (rename 등 복잡 케이스는 1차에서 단순화)
        let porcelain = run_git(path, &["status", "--porcelain", "-z"])?;
        let path_set: std::collections::HashSet<String> = files.into_iter().collect();
        let mut tracked: Vec<String> = Vec::new();
        let mut untracked: Vec<String> = Vec::new();
        for entry in porcelain.split('\0') {
            if entry.len() < 3 {
                continue;
            }
            let code = &entry[..2];
            let file = entry[3..].to_string();
            if !path_set.contains(&file) {
                continue;
            }
            if code == "??" {
                untracked.push(file);
            } else {
                tracked.push(file);
            }
        }

        // 2) tracked → unstage (reset) + working tree 복원 (checkout HEAD)
        if !tracked.is_empty() {
            let mut reset_args: Vec<&str> = vec!["reset", "HEAD", "--"];
            for f in &tracked {
                reset_args.push(f.as_str());
            }
            // staged 변경 없는 파일도 안전 — exit 0
            run_git(path, &reset_args)?;

            let mut checkout_args: Vec<&str> = vec!["checkout", "HEAD", "--"];
            for f in &tracked {
                checkout_args.push(f.as_str());
            }
            run_git(path, &checkout_args)?;
        }

        // 3) untracked → opt-in 시 영구 삭제
        let untracked_processed = if include_untracked && !untracked.is_empty() {
            let mut clean_args: Vec<&str> = vec!["clean", "-f", "--"];
            for f in &untracked {
                clean_args.push(f.as_str());
            }
            run_git(path, &clean_args)?;
            untracked.len()
        } else {
            0
        };
        let untracked_skipped = untracked.len() - untracked_processed;

        Ok(DiscardResult {
            tracked: tracked.len(),
            untracked: untracked_processed,
            skipped_untracked: untracked_skipped,
        })
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardResult {
    /// 복원된 tracked 파일 수
    pub tracked: usize,
    /// 영구 삭제된 untracked 파일 수
    pub untracked: usize,
    /// include_untracked=false 라서 건너뛴 untracked 파일 수
    pub skipped_untracked: usize,
}

/// 부분 staging — hunk 단위 패치를 stdin으로 git apply --cached 에 전달.
/// `reverse=true` 면 staged → unstaged 로 되돌림 (--reverse).
#[tauri::command]
pub fn apply_patch_cached(
    patch: String,
    reverse: Option<bool>,
    state: State<AppState>,
) -> Result<(), String> {
    use std::io::Write;
    use std::process::Stdio;
    with_repo(&state, |path| {
        let mut cmd = Command::new("git");
        cmd.arg("-C").arg(path);
        cmd.args(["apply", "--cached", "--whitespace=nowarn"]);
        if reverse.unwrap_or(false) {
            cmd.arg("--reverse");
        }
        cmd.arg("-");
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| format!("git 실행 실패: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(patch.as_bytes())
                .map_err(|e| format!("패치 stdin write 실패: {}", e))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|e| format!("git apply 종료 실패: {}", e))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(())
    })
}

#[tauri::command]
pub fn commit(
    message: String,
    body: Option<String>,
    state: State<AppState>,
) -> Result<CommitResult, String> {
    with_repo(&state, |path| {
        // body 가 있으면 git commit -m <subject> -m <body> 형식으로 깔끔히 분리.
        // git 이 알아서 빈 줄 separator 삽입.
        let mut args: Vec<&str> = vec!["commit", "-m", &message];
        let body_trimmed = body.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
        if let Some(b) = body_trimmed {
            args.push("-m");
            args.push(b);
        }
        let out = run_git(path, &args)?;
        let hash = out
            .lines()
            .next()
            .and_then(|l| l.split(|c| c == '[' || c == ']').nth(1))
            .and_then(|inner| inner.split_whitespace().nth(1))
            .unwrap_or("")
            .to_string();
        Ok(CommitResult {
            hash,
            summary: serde_json::json!({}),
        })
    })
}

#[tauri::command]
pub fn get_branches(state: State<AppState>) -> Result<BranchInfo, String> {
    with_repo(&state, |path| {
        let current = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"])
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| "HEAD".to_string());
        let raw = run_git(path, &["branch", "--list", "--format=%(refname:short)"])?;
        let all: Vec<String> = raw
            .lines()
            .filter(|l| !l.is_empty())
            .map(|s| s.to_string())
            .collect();
        Ok(BranchInfo { current, all })
    })
}

#[tauri::command]
pub fn checkout(branch: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["checkout", &branch])?;
        Ok(())
    })
}

#[tauri::command]
pub fn create_branch(
    name: String,
    checkout: Option<bool>,
    state: State<AppState>,
) -> Result<(), String> {
    with_repo(&state, |path| {
        if name.trim().is_empty() {
            return Err("브랜치 이름이 비어있습니다".to_string());
        }
        if checkout.unwrap_or(false) {
            run_git(path, &["checkout", "-b", &name])?;
        } else {
            run_git(path, &["branch", &name])?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn delete_branch(
    name: String,
    force: Option<bool>,
    state: State<AppState>,
) -> Result<(), String> {
    with_repo(&state, |path| {
        let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
        run_git(path, &["branch", flag, &name])?;
        Ok(())
    })
}

#[tauri::command]
pub fn merge_branch(
    name: String,
    no_ff: Option<bool>,
    state: State<AppState>,
) -> Result<String, String> {
    with_repo(&state, |path| {
        let mut args: Vec<&str> = vec!["merge"];
        if no_ff.unwrap_or(false) {
            args.push("--no-ff");
        }
        args.push(&name);
        let out = run_git(path, &args)?;
        Ok(out.trim().to_string())
    })
}

/// 단일 커밋을 현재 브랜치로 cherry-pick.
/// - `no_commit`: true 면 적용만 하고 커밋은 보류 (--no-commit)
/// - `mainline`: merge 커밋일 때 부모 번호 (1=첫번째 부모, 2=두번째 부모)
#[tauri::command]
pub fn cherry_pick(
    hash: String,
    no_commit: Option<bool>,
    mainline: Option<u32>,
    state: State<AppState>,
) -> Result<(), String> {
    with_repo(&state, |path| {
        let mainline_str;
        let mut args: Vec<&str> = vec!["cherry-pick"];
        if no_commit.unwrap_or(false) {
            args.push("--no-commit");
        }
        if let Some(m) = mainline {
            args.push("-m");
            mainline_str = m.to_string();
            args.push(&mainline_str);
        }
        args.push(&hash);
        run_git(path, &args)?;
        Ok(())
    })
}

#[tauri::command]
pub fn cherry_pick_abort(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["cherry-pick", "--abort"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn cherry_pick_continue(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["cherry-pick", "--continue"])?;
        Ok(())
    })
}

// ───── Conflict resolution (Phase 8-G-1) ───────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictedFile {
    path: String,
    /// "both modified" | "both added" | "both deleted" | "added by us" | "added by them" | "deleted by us" | "deleted by them"
    kind: String,
}

/// 현재 진행 중인 머지/cherry-pick/rebase의 충돌 파일 목록.
#[tauri::command]
pub fn list_conflicted_files(state: State<AppState>) -> Result<Vec<ConflictedFile>, String> {
    with_repo(&state, |path| {
        let raw = run_git(path, &["status", "--porcelain=v1"])?;
        let mut conflicts = Vec::new();
        for line in raw.lines() {
            if line.len() < 3 {
                continue;
            }
            let bytes = line.as_bytes();
            let x = bytes[0] as char;
            let y = bytes[1] as char;
            let file = line[3..].to_string();
            let kind = match (x, y) {
                ('U', 'U') => "both modified",
                ('A', 'A') => "both added",
                ('D', 'D') => "both deleted",
                ('A', 'U') => "added by us",
                ('U', 'A') => "added by them",
                ('D', 'U') => "deleted by us",
                ('U', 'D') => "deleted by them",
                _ => continue,
            };
            conflicts.push(ConflictedFile {
                path: file,
                kind: kind.to_string(),
            });
        }
        Ok(conflicts)
    })
}

/// 충돌 파일을 "ours" 또는 "theirs" 버전으로 일괄 해결 후 staging.
/// strategy: "ours" | "theirs"
#[tauri::command]
pub fn resolve_conflict(
    file: String,
    strategy: String,
    state: State<AppState>,
) -> Result<(), String> {
    with_repo(&state, |path| {
        let strat = match strategy.as_str() {
            "ours" => "--ours",
            "theirs" => "--theirs",
            other => return Err(format!("알 수 없는 strategy: {}", other)),
        };
        run_git(path, &["checkout", strat, "--", &file])?;
        run_git(path, &["add", "--", &file])?;
        Ok(())
    })
}

/// `from..HEAD` 범위의 커밋 목록을 oldest-first 순서로 반환.
/// interactive rebase 모달에서 사용.
#[tauri::command]
pub fn list_commits_in_range(from: String, state: State<AppState>) -> Result<Vec<CommitInfo>, String> {
    with_repo(&state, |path| {
        let range = format!("{}..HEAD", from);
        let raw = run_git(
            path,
            &[
                "log",
                &range,
                "--reverse",
                "--pretty=format:%H\x1f%h\x1f%s\x1f%an\x1f%ae\x1f%aI\x1f%D\x1f%P",
            ],
        )?;
        Ok(parse_log(&raw))
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseOp {
    pub hash: String,
    /// "pick" | "reword" | "squash" | "fixup" | "drop"
    pub action: String,
    /// reword/squash 시 새 커밋 메시지. pick/fixup/drop은 무시.
    #[serde(default)]
    pub message: Option<String>,
}

/// Interactive rebase: reorder + drop + reword + squash + fixup.
/// 안전장치: 시작 시 HEAD를 저장 → 실패 시 cherry-pick abort + reset --hard 로 원상 복구.
/// 충돌 시 부분 상태 노출 없이 깔끔히 롤백.
#[tauri::command]
pub fn interactive_rebase(
    from: String,
    operations: Vec<RebaseOp>,
    state: State<AppState>,
) -> Result<(), String> {
    with_repo(&state, |path| {
        // 1. 원본 HEAD 저장 (롤백용)
        let original_head = run_git(path, &["rev-parse", "HEAD"])?
            .trim()
            .to_string();

        // 2. clean working tree 검증
        let dirty = run_git(path, &["status", "--porcelain"])?;
        if !dirty.trim().is_empty() {
            return Err(
                "워킹트리에 변경사항이 있습니다. 커밋 또는 stash 후 다시 시도하세요.".to_string(),
            );
        }

        // 3. 사전 검증
        // - reword/squash: 메시지 누락
        // - squash/fixup: 첫 적용 위치(이전 적용 커밋 없음)에 올 수 없음
        let mut prior_applied = false;
        for op in &operations {
            match op.action.as_str() {
                "pick" | "reword" => {
                    if op.action == "reword" {
                        let msg = op.message.as_deref().map(str::trim).unwrap_or("");
                        if msg.is_empty() {
                            return Err(format!(
                                "{} reword 작업에 메시지가 비어있습니다.",
                                &op.hash[..7.min(op.hash.len())]
                            ));
                        }
                    }
                    prior_applied = true;
                }
                "squash" => {
                    let msg = op.message.as_deref().map(str::trim).unwrap_or("");
                    if msg.is_empty() {
                        return Err(format!(
                            "{} squash 작업에 결합 메시지가 비어있습니다.",
                            &op.hash[..7.min(op.hash.len())]
                        ));
                    }
                    if !prior_applied {
                        return Err(format!(
                            "{} squash는 첫 위치에 올 수 없습니다 (결합 대상 이전 커밋이 없음).",
                            &op.hash[..7.min(op.hash.len())]
                        ));
                    }
                    prior_applied = true;
                }
                "fixup" => {
                    if !prior_applied {
                        return Err(format!(
                            "{} fixup은 첫 위치에 올 수 없습니다 (결합 대상 이전 커밋이 없음).",
                            &op.hash[..7.min(op.hash.len())]
                        ));
                    }
                    prior_applied = true;
                }
                "drop" => {}
                other => {
                    return Err(format!("알 수 없는 action: {}", other));
                }
            }
        }

        let rollback = |path: &PathBuf, ctx: &str, e: &str, hash: &str| -> String {
            let _ = run_git(path, &["cherry-pick", "--abort"]);
            let _ = run_git(path, &["reset", "--hard", &original_head]);
            format!(
                "{} {} 실패. 원상 복구됨.\n\n{}",
                &hash[..7.min(hash.len())],
                ctx,
                e
            )
        };

        // 4. from으로 reset --hard
        run_git(path, &["reset", "--hard", &from])
            .map_err(|e| format!("base reset 실패: {}", e))?;

        // 5. 각 op 실행
        for op in &operations {
            match op.action.as_str() {
                "pick" => {
                    if let Err(e) = run_git(path, &["cherry-pick", &op.hash]) {
                        return Err(rollback(path, "cherry-pick", &e, &op.hash));
                    }
                }
                "reword" => {
                    if let Err(e) = run_git(path, &["cherry-pick", &op.hash]) {
                        return Err(rollback(path, "cherry-pick (reword)", &e, &op.hash));
                    }
                    let msg = op.message.as_deref().unwrap_or("");
                    if let Err(e) = run_git(path, &["commit", "--amend", "-m", msg]) {
                        return Err(rollback(path, "메시지 amend", &e, &op.hash));
                    }
                }
                "squash" => {
                    if let Err(e) = run_git(path, &["cherry-pick", &op.hash]) {
                        return Err(rollback(path, "cherry-pick (squash)", &e, &op.hash));
                    }
                    // 직전 커밋과 결합: reset --soft로 이번 cherry-pick 커밋만 풀고 변경사항은 staging에 둠
                    if let Err(e) = run_git(path, &["reset", "--soft", "HEAD~1"]) {
                        return Err(rollback(path, "soft reset", &e, &op.hash));
                    }
                    let msg = op.message.as_deref().unwrap_or("");
                    if let Err(e) = run_git(path, &["commit", "--amend", "-m", msg]) {
                        return Err(rollback(path, "squash amend", &e, &op.hash));
                    }
                }
                "fixup" => {
                    if let Err(e) = run_git(path, &["cherry-pick", &op.hash]) {
                        return Err(rollback(path, "cherry-pick (fixup)", &e, &op.hash));
                    }
                    if let Err(e) = run_git(path, &["reset", "--soft", "HEAD~1"]) {
                        return Err(rollback(path, "soft reset (fixup)", &e, &op.hash));
                    }
                    // 직전 커밋의 메시지 그대로 유지: --amend --no-edit
                    if let Err(e) = run_git(path, &["commit", "--amend", "--no-edit"]) {
                        return Err(rollback(path, "fixup amend", &e, &op.hash));
                    }
                }
                "drop" => {
                    // skip — 커밋이 새 히스토리에 포함되지 않음
                }
                other => {
                    let _ = run_git(path, &["reset", "--hard", &original_head]);
                    return Err(format!("알 수 없는 action: {}", other));
                }
            }
        }
        Ok(())
    })
}

/// 현재 브랜치를 지정한 커밋/브랜치 위로 rebase (비-interactive).
#[tauri::command]
pub fn rebase(target: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["rebase", &target])?;
        Ok(())
    })
}

#[tauri::command]
pub fn rebase_abort(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["rebase", "--abort"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn rebase_continue(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["rebase", "--continue"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn rebase_skip(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["rebase", "--skip"])?;
        Ok(())
    })
}

/// rebase 진행 중 여부 (.git/rebase-merge 또는 .git/rebase-apply 디렉토리 존재 검사)
#[tauri::command]
pub fn rebase_in_progress(state: State<AppState>) -> Result<bool, String> {
    with_repo(&state, |path| {
        let git_dir = run_git(path, &["rev-parse", "--git-dir"])?;
        let git_dir_trimmed = git_dir.trim();
        let base = if std::path::Path::new(git_dir_trimmed).is_absolute() {
            std::path::PathBuf::from(git_dir_trimmed)
        } else {
            path.join(git_dir_trimmed)
        };
        Ok(base.join("rebase-merge").is_dir() || base.join("rebase-apply").is_dir())
    })
}

/// 현재 브랜치 HEAD를 지정한 커밋으로 reset.
/// - mode: "soft" (HEAD만 이동) | "mixed" (HEAD + 스테이징 초기화) | "hard" (HEAD + 스테이징 + 워킹트리 초기화, 위험)
#[tauri::command]
pub fn reset(hash: String, mode: String, state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        let mode_flag = match mode.as_str() {
            "soft" => "--soft",
            "mixed" => "--mixed",
            "hard" => "--hard",
            _ => return Err(format!("알 수 없는 reset 모드: {}", mode)),
        };
        run_git(path, &["reset", mode_flag, &hash])?;
        Ok(())
    })
}

/// cherry-pick 진행 중 여부 (.git/CHERRY_PICK_HEAD 존재 검사)
#[tauri::command]
pub fn cherry_pick_in_progress(state: State<AppState>) -> Result<bool, String> {
    with_repo(&state, |path| {
        let git_dir = run_git(path, &["rev-parse", "--git-dir"])?;
        let git_dir_trimmed = git_dir.trim();
        let cherry_head = if std::path::Path::new(git_dir_trimmed).is_absolute() {
            std::path::PathBuf::from(git_dir_trimmed).join("CHERRY_PICK_HEAD")
        } else {
            path.join(git_dir_trimmed).join("CHERRY_PICK_HEAD")
        };
        Ok(cherry_head.exists())
    })
}

#[tauri::command]
pub fn fetch(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["fetch", "--all", "--prune"])?;
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    /// upstream(@{u}) 가 설정돼 있는지
    has_upstream: bool,
    /// 예: "origin/main" — upstream 없으면 None
    upstream: Option<String>,
    /// 로컬에만 있는 커밋 수 (push 후보)
    ahead: u32,
    /// 원격에만 있는 커밋 수 (pull 후보)
    behind: u32,
}

/// 현재 브랜치의 원격 추적 상태 (ahead/behind).
/// upstream 미설정이거나 fetch 안 한 상태면 has_upstream=false.
#[tauri::command]
pub fn get_remote_status(state: State<AppState>) -> Result<RemoteStatus, String> {
    with_repo(&state, |path| {
        // upstream 존재 여부 확인
        let upstream_result =
            run_git(path, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
        let upstream = match upstream_result {
            Ok(s) => {
                let trimmed = s.trim().to_string();
                if trimmed.is_empty() {
                    return Ok(RemoteStatus {
                        has_upstream: false,
                        upstream: None,
                        ahead: 0,
                        behind: 0,
                    });
                }
                trimmed
            }
            Err(_) => {
                // upstream 없음 (브랜치 새로 만들고 push 전 등)
                return Ok(RemoteStatus {
                    has_upstream: false,
                    upstream: None,
                    ahead: 0,
                    behind: 0,
                });
            }
        };

        // ahead/behind 계산: rev-list --left-right --count HEAD...@{u}
        // 출력 형식: "<ahead>\t<behind>"
        let counts = run_git(
            path,
            &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
        )?;
        let mut parts = counts.split_whitespace();
        let ahead = parts
            .next()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);
        let behind = parts
            .next()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        Ok(RemoteStatus {
            has_upstream: true,
            upstream: Some(upstream),
            ahead,
            behind,
        })
    })
}

#[tauri::command]
pub fn push(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["push"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn pull(state: State<AppState>) -> Result<(), String> {
    with_repo(&state, |path| {
        run_git(path, &["pull"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn get_file_history(
    file_path: String,
    state: State<AppState>,
) -> Result<Vec<CommitInfo>, String> {
    with_repo(&state, |path| {
        let raw = run_git(
            path,
            &[
                "log",
                "-100",
                "--follow",
                "--pretty=format:%H\x1f%h\x1f%s\x1f%an\x1f%ae\x1f%aI\x1f%D\x1f%P",
                "--",
                &file_path,
            ],
        )?;
        Ok(parse_log(&raw))
    })
}

#[tauri::command]
pub fn get_file_tree(state: State<AppState>) -> Result<Vec<FileTreeNode>, String> {
    with_repo(&state, |path| build_tree_shallow(path, ""))
}

/// lazy loading: expand 시점에 해당 디렉토리만 반환 (재귀 없음)
#[tauri::command]
pub fn get_directory_children(
    rel_path: String,
    state: State<AppState>,
) -> Result<Vec<FileTreeNode>, String> {
    with_repo(&state, |root| {
        // relative path 안전성 검증: 루트 내부 경로만 허용
        let target = root.join(&rel_path);
        let canonical = target
            .canonicalize()
            .map_err(|e| format!("경로 확인 실패: {}", e))?;
        let root_canonical = root
            .canonicalize()
            .map_err(|e| format!("루트 경로 확인 실패: {}", e))?;
        if !canonical.starts_with(&root_canonical) {
            return Err("레포 외부 경로입니다".to_string());
        }
        build_tree_shallow(&canonical, &rel_path)
    })
}

/// 1단계만 읽음 (children은 None) — lazy load 전제
fn build_tree_shallow(dir: &PathBuf, rel: &str) -> Result<Vec<FileTreeNode>, String> {
    let mut nodes = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || name == "node_modules"
            || name == "dist"
            || name == "target"
        {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let rel_path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel, name)
        };

        let node_type = if meta.is_dir() { "directory" } else { "file" };
        nodes.push(FileTreeNode {
            name,
            path: rel_path,
            node_type: node_type.to_string(),
            children: None,
        });
    }

    nodes.sort_by(|a, b| {
        if a.node_type != b.node_type {
            if a.node_type == "directory" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(nodes)
}
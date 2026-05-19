//! llama-server (llama.cpp) 자식 프로세스 라이프사이클 + 바이너리 자동 설치.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use chrono::Utc;
use serde::Deserialize;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr};
use tokio::sync::Mutex as TokioMutex;

use super::download::{download_to_file, DownloadProgress};
use super::paths;

/// stderr tail buffer 가 유지할 최대 줄 수 — 시작 실패 시 에러 메시지에 포함됨.
const STDERR_TAIL_MAX_LINES: usize = 40;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 실행 중 sidecar 의 상태.
pub struct AiServerHandle {
    pub child: Child,
    pub port: u16,
    pub model_id: String,
}

impl AiServerHandle {
    pub async fn stop(mut self) {
        // 명시적 종료 — Drop 시점이 아닌 await 가능한 stop 사용
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

// ───── llama-server 바이너리 자동 다운로드 ─────────────────────

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// 현재 플랫폼에 맞는 llama.cpp 릴리즈 asset 이름 패턴.
fn asset_pattern() -> Result<&'static str, String> {
    if cfg!(target_os = "windows") {
        // CPU AVX2 빌드 (가장 호환성 높음). CUDA/Vulkan 빌드는 Phase 11-B-2 에서.
        Ok("bin-win-cpu-x64.zip")
    } else if cfg!(target_os = "linux") {
        Ok("bin-ubuntu-x64.zip")
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            Ok("bin-macos-arm64.zip")
        } else {
            Ok("bin-macos-x64.zip")
        }
    } else {
        Err("지원하지 않는 OS 입니다".to_string())
    }
}

/// llama.cpp latest release 에서 현재 플랫폼용 zip 을 받아 bin_dir 에 해제.
pub async fn download_server(on_progress: &Channel<DownloadProgress>) -> Result<String, String> {
    let pattern = asset_pattern()?;

    // 1) latest release 메타데이터
    let client = reqwest::Client::builder()
        .user_agent("Pepper/0.4 (+https://github.com/cho1124/Pepper)")
        .build()
        .map_err(|e| format!("HTTP 클라이언트 생성 실패: {}", e))?;

    let release: Release = client
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("릴리즈 조회 실패: {}", e))?
        .json()
        .await
        .map_err(|e| format!("릴리즈 JSON 파싱 실패: {}", e))?;

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.contains(pattern))
        .ok_or_else(|| format!("플랫폼에 맞는 asset 을 찾지 못했습니다 (패턴: {})", pattern))?;

    // 2) zip 다운로드 → 임시 파일
    let bin_dir = paths::bin_dir()?;
    let zip_path = bin_dir.join(format!("__llama-{}.zip", release.tag_name));
    download_to_file(&asset.browser_download_url, &zip_path, on_progress).await?;

    // 3) zip 해제 (bin_dir 안에 펼침)
    extract_zip(&zip_path, &bin_dir)?;

    // 4) 임시 zip 정리
    let _ = std::fs::remove_file(&zip_path);

    // 5) server binary 가 정상 위치에 있는지 검증
    let server = paths::server_binary_path()?;
    if !server.exists() {
        // 일부 릴리즈는 zip 안에 하위 폴더로 풀림 — bin_dir 전체에서 탐색해서 옮김
        relocate_server_binary(&bin_dir)?;
    }
    if !server.exists() {
        return Err("zip 해제 후 llama-server 바이너리를 찾을 수 없습니다".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&server)
            .map_err(|e| format!("권한 조회 실패: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&server, perms)
            .map_err(|e| format!("실행 권한 부여 실패: {}", e))?;
    }

    Ok(release.tag_name)
}

fn extract_zip(zip_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("zip 열기 실패: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip 해석 실패: {}", e))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip 항목 접근 실패: {}", e))?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("디렉토리 생성 실패: {}", e))?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("상위 디렉토리 생성 실패: {}", e))?;
            }
            let mut out =
                std::fs::File::create(&outpath).map_err(|e| format!("파일 생성 실패: {}", e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("파일 쓰기 실패: {}", e))?;
        }
    }
    Ok(())
}

/// llama.cpp 릴리즈가 zip 안에서 `build/bin/llama-server.exe` 같은 하위 폴더에
/// 풀리는 경우, bin_dir 직속으로 옮기고 DLL 들도 함께 이동.
fn relocate_server_binary(bin_dir: &PathBuf) -> Result<(), String> {
    let target_name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };

    // 가장 가까운 깊이의 server binary 찾기
    fn find(start: &PathBuf, name: &str) -> Option<PathBuf> {
        for entry in std::fs::read_dir(start).ok()?.flatten() {
            let p = entry.path();
            if p.is_file() && p.file_name().and_then(|s| s.to_str()) == Some(name) {
                return Some(p);
            }
            if p.is_dir() {
                if let Some(found) = find(&p, name) {
                    return Some(found);
                }
            }
        }
        None
    }

    let found = find(bin_dir, target_name)
        .ok_or_else(|| format!("zip 안에서 {} 를 찾지 못했습니다", target_name))?;

    let source_dir = found
        .parent()
        .ok_or_else(|| "server binary 의 부모 디렉토리를 알 수 없습니다".to_string())?
        .to_path_buf();

    // 같은 디렉토리의 모든 dll/so/dylib 도 함께 옮김
    for entry in std::fs::read_dir(&source_dir)
        .map_err(|e| format!("source dir 읽기 실패: {}", e))?
        .flatten()
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(fname) = path.file_name() {
                let dest = bin_dir.join(fname);
                if dest.exists() {
                    let _ = std::fs::remove_file(&dest);
                }
                std::fs::rename(&path, &dest)
                    .map_err(|e| format!("파일 이동 실패: {}", e))?;
            }
        }
    }

    Ok(())
}

// ───── sidecar spawn ──────────────────────────────────────────

/// 사용할 포트를 27182 부터 가용한 첫 포트로 찾는다. 단순 listen 시도 방식.
fn pick_port() -> Result<u16, String> {
    use std::net::TcpListener;
    for port in 27182..27282 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err("사용 가능한 포트를 찾지 못했습니다 (27182~27281)".to_string())
}

pub async fn spawn_server(
    model_path: &PathBuf,
    ctx: u32,
    model_id: String,
) -> Result<AiServerHandle, String> {
    let server = paths::server_binary_path()?;
    if !server.exists() {
        return Err(
            "llama-server 바이너리가 설치되지 않았습니다 — 먼저 다운로드하세요".to_string(),
        );
    }
    if !model_path.exists() {
        return Err(format!(
            "모델 파일이 없습니다: {}",
            model_path.display()
        ));
    }

    let port = pick_port()?;
    let log_path = paths::logs_dir()?.join("llama-server.log");

    let mut std_cmd = std::process::Command::new(&server);
    std_cmd
        .arg("-m")
        .arg(model_path)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("-c")
        .arg(ctx.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut cmd = tokio::process::Command::from(std_cmd);
    cmd.kill_on_drop(true);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("llama-server 시작 실패: {}", e))?;

    // stderr 캡처 — 파일 로그 + 메모리 tail buffer (시작 실패 시 에러 메시지에 포함)
    let tail_buf: Arc<TokioMutex<VecDeque<String>>> = Arc::new(TokioMutex::new(
        VecDeque::with_capacity(STDERR_TAIL_MAX_LINES),
    ));
    if let Some(stderr) = child.stderr.take() {
        let tail_clone = tail_buf.clone();
        let log_path_clone = log_path.clone();
        let model_id_clone = model_id.clone();
        tokio::spawn(async move {
            capture_stderr(stderr, log_path_clone, tail_clone, &model_id_clone, port).await;
        });
    }

    // /health 폴링으로 ready 대기 (최대 30초)
    let ready = wait_for_ready(port, 30).await;
    if !ready {
        // tail buffer 가 채워질 시간을 잠시 줌
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let tail_lines: Vec<String> = tail_buf.lock().await.iter().cloned().collect();
        let _ = AiServerHandle {
            child,
            port,
            model_id: model_id.clone(),
        }
        .stop()
        .await;

        let mut msg = String::from("llama-server 가 30초 안에 응답하지 않았습니다");
        if !tail_lines.is_empty() {
            msg.push_str("\n\n[llama-server stderr 마지막 ");
            msg.push_str(&tail_lines.len().to_string());
            msg.push_str("줄]\n");
            msg.push_str(&tail_lines.join("\n"));
        }
        msg.push_str("\n\n전체 로그: ");
        msg.push_str(&log_path.display().to_string());
        return Err(msg);
    }

    Ok(AiServerHandle {
        child,
        port,
        model_id,
    })
}

/// 자식 프로세스 stderr 를 라인 단위로 읽어
/// (1) `<DataLocal>/pepper/logs/llama-server.log` 에 append
/// (2) 메모리 tail 버퍼에 마지막 N줄 유지 — spawn_server 가 시작 실패 시 에러 메시지로 노출.
async fn capture_stderr(
    stderr: ChildStderr,
    log_path: PathBuf,
    tail_buf: Arc<TokioMutex<VecDeque<String>>>,
    model_id: &str,
    port: u16,
) {
    // 로그 파일 open (append). 실패하면 메모리 버퍼만 채움.
    let mut log_file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .await
        .ok();

    if let Some(ref mut f) = log_file {
        let header = format!(
            "\n===== spawn @ {} | model={} | port={} =====\n",
            Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            model_id,
            port
        );
        let _ = f.write_all(header.as_bytes()).await;
    }

    let mut reader = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(ref mut f) = log_file {
            let _ = f.write_all(line.as_bytes()).await;
            let _ = f.write_all(b"\n").await;
        }
        let mut buf = tail_buf.lock().await;
        if buf.len() >= STDERR_TAIL_MAX_LINES {
            buf.pop_front();
        }
        buf.push_back(line);
    }
}

async fn wait_for_ready(port: u16, max_secs: u64) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let url = format!("http://127.0.0.1:{}/health", port);
    for _ in 0..max_secs * 2 {
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    false
}


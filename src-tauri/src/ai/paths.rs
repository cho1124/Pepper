use std::path::PathBuf;

/// 앱 데이터 루트 (`<DataLocal>/pepper/`).
///
/// 리브랜딩 마이그레이션: 과거 `<DataLocal>/gitscope/` 가 있고 새 위치가 없으면 한 번만 rename.
/// 이미 다운로드한 모델/llama-server 바이너리(2GB+)를 재다운로드하지 않도록.
fn root() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "사용자 데이터 디렉토리를 찾을 수 없습니다".to_string())?;
    let new_root = base.join("pepper");
    let old_root = base.join("gitscope");
    if old_root.exists() && !new_root.exists() {
        // rename 실패해도 fallback 없이 진행 — 새 디렉토리는 어차피 create_dir_all 로 생성됨
        let _ = std::fs::rename(&old_root, &new_root);
    }
    Ok(new_root)
}

pub fn models_dir() -> Result<PathBuf, String> {
    let p = root()?.join("models");
    std::fs::create_dir_all(&p).map_err(|e| format!("models dir 생성 실패: {}", e))?;
    Ok(p)
}

pub fn bin_dir() -> Result<PathBuf, String> {
    let p = root()?.join("bin");
    std::fs::create_dir_all(&p).map_err(|e| format!("bin dir 생성 실패: {}", e))?;
    Ok(p)
}

pub fn logs_dir() -> Result<PathBuf, String> {
    let p = root()?.join("logs");
    std::fs::create_dir_all(&p).map_err(|e| format!("logs dir 생성 실패: {}", e))?;
    Ok(p)
}

pub fn model_path(filename: &str) -> Result<PathBuf, String> {
    Ok(models_dir()?.join(filename))
}

/// llama-server 실행 파일 경로 (플랫폼별 확장자 포함).
pub fn server_binary_path() -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    Ok(bin_dir()?.join(name))
}
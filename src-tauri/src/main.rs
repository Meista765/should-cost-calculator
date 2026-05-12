// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

const BUNDLE_FILENAME: &str = "encrypted.json";

fn appdata_bundle_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resolver = app.path();
    let dir = resolver
        .app_data_dir()
        .map_err(|e| format!("AppData 경로 확인 실패: {e}"))?;
    Ok(dir.join(BUNDLE_FILENAME))
}

fn ensure_bundle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let target = appdata_bundle_path(app)?;
    if target.exists() {
        return Ok(target);
    }
    let parent = target
        .parent()
        .ok_or_else(|| "AppData 부모 경로 없음".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("AppData 디렉터리 생성 실패: {e}"))?;

    // 임베디드 시드 (bundle.resources 로 동봉됨) 를 APPDATA 로 복사.
    let seed = app
        .path()
        .resolve(
            format!("resources/{BUNDLE_FILENAME}"),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| format!("시드 리소스 경로 확인 실패: {e}"))?;
    fs::copy(&seed, &target).map_err(|e| format!("시드 복사 실패: {e}"))?;
    Ok(target)
}

#[tauri::command]
fn read_bundle(app: tauri::AppHandle) -> Result<String, String> {
    let path = ensure_bundle(&app)?;
    fs::read_to_string(&path).map_err(|e| format!("번들 읽기 실패: {e}"))
}

#[tauri::command]
fn write_bundle(app: tauri::AppHandle, json: String) -> Result<(), String> {
    // 형식 검증: JSON parsable + v2 핵심 필드 보유.
    let v: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("JSON 파싱 실패: {e}"))?;
    if v.get("version").and_then(|s| s.as_str()) != Some("2") {
        return Err("v2 envelope 이 아닙니다.".into());
    }
    if v.get("ciphertext").is_none()
        || v.get("dataIv").is_none()
        || v.get("wrappers").is_none()
    {
        return Err("필수 필드 (ciphertext/dataIv/wrappers) 누락.".into());
    }

    let path = appdata_bundle_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "AppData 부모 경로 없음".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("디렉터리 생성 실패: {e}"))?;

    // temp 파일 → atomic rename (NTFS 동일 볼륨 보장).
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("임시 파일 생성 실패: {e}"))?;
        f.write_all(json.as_bytes())
            .map_err(|e| format!("임시 파일 쓰기 실패: {e}"))?;
        f.sync_all().map_err(|e| format!("flush 실패: {e}"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| format!("rename 실패: {e}"))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_bundle, write_bundle])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 실패");
}

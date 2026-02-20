// Nord Stage 3 Interface - Tauri backend

mod ai_assistant;

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

// ── Sidecar state ──────────────────────────────────────────────────────────

struct SidecarHandle(Mutex<Option<Child>>);

#[tauri::command]
fn spawn_sidecar(state: State<'_, SidecarHandle>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }

    let python_candidates = [
        r"C:\Users\svenftw\AppData\Local\Programs\Python\Python312\python.exe",
        "python3",
        "python",
    ];

    let script = {
        let mut p = std::env::current_dir().unwrap_or_default();
        p.push("src-python");
        p.push("main.py");
        p
    };

    for candidate in &python_candidates {
        match Command::new(candidate).arg(&script).spawn() {
            Ok(child) => {
                *guard = Some(child);
                return Ok(());
            }
            Err(_) => continue,
        }
    }

    Err("Could not find a Python executable. Make sure Python 3.12 is installed.".into())
}

#[tauri::command]
fn stop_sidecar(state: State<'_, SidecarHandle>) {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
}

// ── File dialog ────────────────────────────────────────────────────────────

#[tauri::command]
async fn pick_patch_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("Nord Stage 3 Patch", &["ns3fp", "ns3f"])
        .blocking_pick_file()
        .map(|fp| fp.to_string())
}

// ── App entry point ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SidecarHandle(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_midi::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            spawn_sidecar,
            stop_sidecar,
            pick_patch_file,
            // AI assistant
            ai_assistant::get_api_key,
            ai_assistant::set_api_key,
            ai_assistant::delete_api_key,
            ai_assistant::stream_ai_completion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Nord Stage 3 Interface - Tauri backend

mod ai_assistant;

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

// ── Sidecar state ──────────────────────────────────────────────────────────

struct SidecarHandle(Mutex<Option<Child>>);

/// Spawn the Python sidecar. On Android this is a no-op (Python unavailable).
#[tauri::command]
fn spawn_sidecar(state: State<'_, SidecarHandle>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _ = state;
        return Ok(());
    }

    #[cfg(not(target_os = "android"))]
    {
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
            // In dev mode current_dir() is the src-tauri subdirectory; go up to the project root.
            if p.ends_with("src-tauri") {
                p.pop();
            }
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
}

#[tauri::command]
fn stop_sidecar(state: State<'_, SidecarHandle>) {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
}

// ── Patch file reader (ZIP-aware, no sidecar) ──────────────────────────────

/// Read a .ns3fp (ZIP archive) or raw .ns3f file and return the binary bytes.
/// Called by the TypeScript parser so patch loading works without Python.
#[tauri::command]
fn read_patch_bytes(path: String) -> Result<Vec<u8>, String> {
    use std::io::Read;

    if path.to_lowercase().ends_with(".ns3fp") {
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            if entry.name().to_lowercase().ends_with(".ns3f") {
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
                return Ok(bytes);
            }
        }
        Err("No .ns3f file found inside .ns3fp archive".into())
    } else {
        std::fs::read(&path).map_err(|e| e.to_string())
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
            read_patch_bytes,
            // AI assistant
            ai_assistant::get_api_key,
            ai_assistant::set_api_key,
            ai_assistant::delete_api_key,
            ai_assistant::stream_ai_completion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

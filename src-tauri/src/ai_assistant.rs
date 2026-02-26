// AI assistant: config-file key storage + streaming Claude API calls

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Manager};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const CONFIG_FILE: &str = "config.json";

// ── Config file helpers ──────────────────────────────────────────────────────

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_FILE))
}

fn read_config(app: &tauri::AppHandle) -> serde_json::Value {
    config_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}))
}

fn write_config(app: &tauri::AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let path = config_path(app)?;
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

// ── Key commands ─────────────────────────────────────────────────────────────

/// Read the stored API key (returns None if not set yet).
#[tauri::command]
pub fn get_api_key(app: tauri::AppHandle) -> Option<String> {
    let cfg = read_config(&app);
    cfg["api_key"].as_str().map(|s| s.to_string())
}

/// Store the API key in the app config file.
#[tauri::command]
pub fn set_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let mut cfg = read_config(&app);
    cfg["api_key"] = serde_json::Value::String(key);
    write_config(&app, &cfg)
}

/// Remove the stored API key.
#[tauri::command]
pub fn delete_api_key(app: tauri::AppHandle) -> Result<(), String> {
    let mut cfg = read_config(&app);
    if let Some(obj) = cfg.as_object_mut() {
        obj.remove("api_key");
    }
    write_config(&app, &cfg)
}

// ── Streaming completion ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
struct TokenPayload {
    token: String,
    message_id: String,
}

#[derive(Serialize, Clone)]
struct DonePayload {
    full_text: String,
    message_id: String,
}

#[derive(Serialize, Clone)]
struct ErrorPayload {
    error: String,
    message_id: String,
}

/// Stream a Claude completion.
///
/// Emits Tauri events to the frontend:
///  - "ai-token"  { token, message_id }  — one per text delta
///  - "ai-done"   { full_text, message_id } — when generation is complete
///  - "ai-error"  { error, message_id }  — on any failure
#[tauri::command]
pub async fn stream_ai_completion(
    app: tauri::AppHandle,
    model: String,
    system: String,
    messages: Vec<ChatMessage>,
    message_id: String,
) -> Result<(), String> {
    // Load key from config file
    let api_key = {
        let cfg = read_config(&app);
        cfg["api_key"]
            .as_str()
            .ok_or_else(|| {
                "No API key found. Please enter your Anthropic API key in ⚙ Settings.".to_string()
            })?
            .to_string()
    };

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "stream": true,
        "messages": messages,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(API_URL)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let msg = format!("Claude API error {status}: {body}");
        let _ = app.emit(
            "ai-error",
            ErrorPayload { error: msg.clone(), message_id },
        );
        return Err(msg);
    }

    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut full_text = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Process every complete line in the buffer
        loop {
            match buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buf[..pos].trim_end_matches('\r').to_string();
                    buf = buf[pos + 1..].to_string();

                    let Some(data) = line.strip_prefix("data: ") else {
                        continue;
                    };
                    let data = data.trim();

                    if data == "[DONE]" {
                        let _ = app.emit(
                            "ai-done",
                            DonePayload {
                                full_text: full_text.clone(),
                                message_id: message_id.clone(),
                            },
                        );
                        return Ok(());
                    }

                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                        if val["type"] == "content_block_delta"
                            && val["delta"]["type"] == "text_delta"
                        {
                            if let Some(text) = val["delta"]["text"].as_str() {
                                full_text.push_str(text);
                                let _ = app.emit(
                                    "ai-token",
                                    TokenPayload {
                                        token: text.to_string(),
                                        message_id: message_id.clone(),
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // Stream ended without an explicit [DONE] — still send the final text
    let _ = app.emit(
        "ai-done",
        DonePayload {
            full_text,
            message_id,
        },
    );
    Ok(())
}

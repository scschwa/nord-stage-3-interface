// AI assistant: secure key storage + streaming Claude API calls

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

const SERVICE: &str = "nord-stage-3-ai";
const CRED_USER: &str = "claude-api-key";
const API_URL: &str = "https://api.anthropic.com/v1/messages";

// ── Keychain commands ───────────────────────────────────────────────────────

/// Read the stored API key (returns None if not set yet).
#[tauri::command]
pub fn get_api_key() -> Option<String> {
    keyring::Entry::new(SERVICE, CRED_USER)
        .ok()?
        .get_password()
        .ok()
}

/// Store the API key in the OS keychain.
#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    keyring::Entry::new(SERVICE, CRED_USER)
        .map_err(|e| e.to_string())?
        .set_password(&key)
        .map_err(|e| e.to_string())
}

/// Remove the stored API key.
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    keyring::Entry::new(SERVICE, CRED_USER)
        .map_err(|e| e.to_string())?
        .delete_credential()
        .map_err(|e| e.to_string())
}

// ── Streaming completion ────────────────────────────────────────────────────

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
    // Load key from OS keychain
    let api_key = keyring::Entry::new(SERVICE, CRED_USER)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|_| {
            "No API key found. Please enter your Anthropic API key in ⚙ Settings.".to_string()
        })?;

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

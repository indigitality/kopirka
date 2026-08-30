//! CAP-08 — снимок выделенной области по глобальному ⌥⌘C.
//!
//! Рамку выделения рисует системный `screencapture -i`: это родное поведение macOS
//! вместе с отменой по Esc. Готовый PNG уходит в `POST /api/import/capture`
//! с `sourceType = area_screenshot`, временный файл удаляется.

use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::{backend, http};

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

fn notify(app: &AppHandle, body: &str) {
    let _ = app.notification().builder().title("Копирка").body(body).show();
}

fn temp_file() -> PathBuf {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    std::env::temp_dir().join(format!("kopirka-area-{stamp}.png"))
}

/// Запускает съёмку в отдельном потоке: `screencapture` блокирующий, а вызывают его
/// из обработчика хоткея и из меню трея — обоим нельзя вставать колом.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || run(&app));
}

fn run(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            // Первый вызов покажет системный запрос; повторные — уже нет,
            // поэтому объясняем словами, куда идти.
            CGRequestScreenCaptureAccess();
            notify(
                app,
                "Нет доступа к записи экрана. Разрешите его в «Системные настройки → Конфиденциальность и безопасность → Запись экрана» и перезапустите Копирку.",
            );
            return;
        }
    }

    let target = temp_file();
    let status = Command::new("/usr/sbin/screencapture").arg("-i").arg(&target).status();

    match status {
        Ok(_) => {}
        Err(error) => {
            notify(app, &format!("Не удалось запустить снимок экрана: {error}"));
            return;
        }
    }

    // Отмена по Esc — файла просто нет. Это не ошибка, молчим.
    let Ok(bytes) = std::fs::read(&target) else {
        return;
    };
    let _ = std::fs::remove_file(&target);
    if bytes.is_empty() {
        return;
    }

    let payload = serde_json::json!({
        "dataUrl": format!("data:image/png;base64,{}", base64(&bytes)),
        "sourceType": "area_screenshot",
        "suggestedFilename": file_name(),
    })
    .to_string();

    match http::post_json(backend::port(), "/api/import/capture", &payload) {
        Ok(response) if response.status == 200 => notify(app, &describe(&response.body)),
        Ok(response) => notify(app, &format!("Сервер не принял снимок (HTTP {})", response.status)),
        Err(error) => notify(app, &format!("Сервер «Копирки» не ответил: {error}")),
    }
}

fn file_name() -> String {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("Снимок области {stamp}.png")
}

/// Человеческий текст уведомления из ответа импорта.
fn describe(body: &[u8]) -> String {
    let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(body) else {
        return "Снимок отправлен в библиотеку".to_string();
    };
    let outcome = parsed["items"][0]["outcome"].as_str().unwrap_or("");
    match outcome {
        "added" => "Снимок добавлен в библиотеку".to_string(),
        "added_similar" => "Снимок добавлен — похожий уже был".to_string(),
        "duplicate" => "Такой снимок уже есть — не добавлен".to_string(),
        "error" => parsed["items"][0]["errorMessage"]
            .as_str()
            .unwrap_or("Снимок не удалось сохранить")
            .to_string(),
        _ => "Снимок отправлен в библиотеку".to_string(),
    }
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Своя реализация base64 — ради одного вызова тянуть зависимость незачем.
fn base64(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(triple >> 18) as usize & 63] as char);
        out.push(ALPHABET[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(triple >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[triple as usize & 63] as char } else { '=' });
    }
    out
}

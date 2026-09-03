//! CAP-08 — снимок выделенной области по глобальному ⌥⌘C.
//!
//! Рамку выделения рисует системный `screencapture -i`: это родное поведение macOS
//! вместе с отменой по Esc. Готовый PNG уходит в `POST /api/import/capture`
//! с `sourceType = area_screenshot`, временный файл удаляется.

use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{backend, http, notify};

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Уведомления по этому пути — только про неудачу: нет доступа к записи экрана,
/// сервер не ответил. Об удачном снимке говорит общий опрос ленты (events.rs).
fn announce(body: &str) {
    notify::show("Копирка", body);
}

fn temp_file() -> PathBuf {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    std::env::temp_dir().join(format!("kopirka-area-{stamp}.png"))
}

/// Запускает съёмку в отдельном потоке: `screencapture` блокирующий, а вызывают его
/// из обработчика хоткея и из меню трея — обоим нельзя вставать колом.
pub fn start() {
    std::thread::spawn(run);
}

fn run() {
    #[cfg(target_os = "macos")]
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            // Первый вызов покажет системный запрос; повторные — уже нет,
            // поэтому объясняем словами, куда идти.
            CGRequestScreenCaptureAccess();
            announce(
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
            announce(&format!("Не удалось запустить снимок экрана: {error}"));
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
        // Об успехе молчим: уведомление придёт из общего опроса /api/events (events.rs),
        // одно на все пути импорта. Иначе о снимке сказали бы дважды.
        Ok(response) if response.status == 200 => {
            if let Some(problem) = problem(&response.body) {
                announce(&problem);
            }
        }
        Ok(response) => announce(&format!("Сервер не принял снимок (HTTP {})", response.status)),
        Err(error) => announce(&format!("Сервер «Копирки» не ответил: {error}")),
    }
}

fn file_name() -> String {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("Снимок области {stamp}.png")
}

/// Что сказать про уже принятый ответ. `None` — снимок в библиотеке, говорить нечего:
/// про успех уведомит общий опрос журнала событий.
fn problem(body: &[u8]) -> Option<String> {
    let parsed = serde_json::from_slice::<serde_json::Value>(body).ok()?;
    match parsed["items"][0]["outcome"].as_str().unwrap_or("") {
        "added" | "added_similar" => None,
        "duplicate" => Some("Такой снимок уже есть — не добавлен".to_string()),
        "error" => Some(
            parsed["items"][0]["errorMessage"]
                .as_str()
                .unwrap_or("Снимок не удалось сохранить")
                .to_string(),
        ),
        // Непонятный ответ: если файл всё-таки приехал, скажет опрос журнала.
        _ => None,
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

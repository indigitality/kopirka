//! FDB-10 — глобальный хоткей снимка области. Только macOS: съёмки области
//! (CAP-08) в Windows-сборке нет, и плагина там тоже нет (см. Cargo.toml).
//!
//! Сочетание живёт в `config.json` рядом с портом и путём библиотеки — им владеет
//! сервер, а регистрирует его оболочка: у Node нет доступа к системным хоткеям,
//! а у Rust нет интерфейса настроек. Поэтому связь двусторонняя:
//!
//!   настройки → `PATCH /api/settings` → config.json → поллер трея → `register`
//!   `register` → `POST /api/system/shortcut-status` → `GET /api/settings` → настройки
//!
//! Второе плечо нужно, чтобы окно показало «занято другой программой»: плагин
//! отвечает на это только здесь, а без ответа настройки врали бы «сохранено».

use std::str::FromStr;
use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::{backend, http};

/// Что зарегистрировано прямо сейчас: текст из конфига и разобранное сочетание.
/// `None` — хоткей выключен (в конфиге `captureShortcut: null`).
static CURRENT: Mutex<Option<(String, Shortcut)>> = Mutex::new(None);

/// Это сочетание мы и вешали? Обработчик плагина один на всё приложение, а
/// зарегистрировано у нас всегда ровно одно — но сравнить дешевле, чем однажды
/// снять область по чужому событию.
pub fn is_current(shortcut: &Shortcut) -> bool {
    let current = CURRENT.lock().unwrap_or_else(|error| error.into_inner());
    matches!(current.as_ref(), Some((_, registered)) if registered == shortcut)
}

/// Подпись акселератора для пункта трея. `None` — хоткея нет, подписи тоже.
///
/// Нотация плагина и нотация muda совпадают в нужной нам части: `Alt`, `Control`,
/// `Shift` и `Super` muda разбирает сама, а `Super` на macOS рисует как ⌘.
pub fn accelerator() -> Option<String> {
    let current = CURRENT.lock().unwrap_or_else(|error| error.into_inner());
    current.as_ref().map(|(text, _)| text.clone())
}

/// Привести зарегистрированное сочетание к тому, что просит конфиг.
///
/// Ничего не изменилось — выходим молча: функцию зовёт поллер трея каждые две
/// секунды, и перерегистрация на каждом тике съедала бы хоткей на миг у всей
/// системы. Изменилось — снимаем всё прежнее и вешаем новое, а результат
/// отдаём серверу: показать его человеку может только окно.
pub fn apply(app: &AppHandle, spec: Option<String>) {
    let mut current = CURRENT.lock().unwrap_or_else(|error| error.into_inner());
    if current.as_ref().map(|(text, _)| text.as_str()) == spec.as_deref() {
        return;
    }

    if current.is_some() {
        if let Err(error) = app.global_shortcut().unregister_all() {
            crate::diag!("не удалось снять прежний хоткей: {error}");
        }
    }
    *current = None;

    let Some(spec) = spec else {
        // Выключено осознанно — это успех, а не отказ: окно покажет «сохранено».
        report(None, true, None);
        return;
    };

    match Shortcut::from_str(&spec) {
        Ok(hotkey) => match app.global_shortcut().register(hotkey) {
            Ok(()) => {
                *current = Some((spec.clone(), hotkey));
                report(Some(&spec), true, None);
            }
            // Сочетание занято другой программой — это не повод падать: приложение
            // работает и без хоткея, съёмка остаётся в трее и в строке меню.
            Err(error) => {
                crate::diag!("не удалось зарегистрировать {spec}: {error}");
                report(Some(&spec), false, Some(&error.to_string()));
            }
        },
        Err(error) => {
            crate::diag!("сочетание {spec} не разбирается: {error}");
            report(Some(&spec), false, Some(&format!("сочетание не разбирается: {error}")));
        }
    }
}

/// Отчёт серверу. Молча глотаем отказ: сервер мог ещё не подняться или уже
/// гаснуть, и уронить из-за этого регистрацию хоткея было бы странно.
fn report(shortcut: Option<&str>, ok: bool, error: Option<&str>) {
    let body = serde_json::json!({
        "shortcut": shortcut,
        "ok": ok,
        "error": error,
    })
    .to_string();
    if let Err(reason) = http::post_json(backend::port(), "/api/system/shortcut-status", &body) {
        crate::diag!("статус хоткея не доехал до сервера: {reason}");
    }
}

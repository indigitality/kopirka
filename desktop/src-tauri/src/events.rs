//! Уведомления о файлах, приехавших мимо окна: CAP-01, CAP-02, CAP-05, CAP-08.
//!
//! Раньше их слал `osascript` из Folder Action и быстрой команды Finder — и macOS
//! рисовала иконку Script Editor, а не «Копирки». Теперь источник уведомления один,
//! и это само приложение: сервер ведёт журнал успешных импортов (`GET /api/events`),
//! оболочка опрашивает его в цикле трея и показывает одно уведомление на порцию.
//!
//! Перетаскивание и ⌘V — на границе: когда окно перед глазами, оно показывает по ним
//! свой тост, и системное уведомление было бы вторым сообщением об одном и том же.
//! Когда окна не видно, тост показывать некому — а файлы всё равно приезжают, например
//! быстрой командой Finder «Добавить в Копирку». Поэтому решает фокус главного окна.

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::http;

/// Пути импорта, о которых пользователю сказать больше некому.
const ALWAYS_NOTIFIED: [&str; 4] = [
    "folder_watch",     // CAP-05 — автоимпорт папки скриншотов
    "context_menu",     // CAP-01 — «Сохранить в Копирку» из браузера
    "tab_screenshot",   // CAP-02 — скриншот вкладки
    "area_screenshot",  // CAP-08 — ⌥⌘C
];

/// Пути, которые окно умеет показать само — но только пока на него смотрят.
const NOTIFIED_WHEN_AWAY: [&str; 2] = [
    "drag_drop", // CAP-03 — и перетаскивание в окно, и быстрая команда Finder
    "clipboard", // CAP-04 — ⌘V
];

/// Говорить ли про событие. Вынесено отдельно от опроса, чтобы правило проверялось тестом,
/// а не глазами: ошибка здесь — либо молчание про файл, либо дубль к тосту окна.
fn should_notify(source: &str, window_focused: bool) -> bool {
    ALWAYS_NOTIFIED.contains(&source) || (!window_focused && NOTIFIED_WHEN_AWAY.contains(&source))
}

/// Смотрит ли пользователь в окно прямо сейчас. Окна нет, оно спрятано или система
/// не ответила — считаем, что нет: лишнее уведомление лучше молчания про файл,
/// которого никто не увидел.
fn main_window_focused(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    if !window.is_visible().unwrap_or(false) {
        return false;
    }
    window.is_focused().unwrap_or(false)
}

/// Один заход опроса. `cursor` — номер последнего увиденного события; хранит его
/// вызывающий цикл, чтобы состояние не пряталось в глобальной переменной.
pub fn poll(app: &AppHandle, port: u16, cursor: &mut Option<i64>) {
    let path = match cursor {
        None => "/api/events".to_string(),
        Some(seq) => format!("/api/events?after={seq}"),
    };
    let Ok(response) = http::get(port, &path) else {
        return;
    };
    if response.status != 200 {
        return;
    }
    let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&response.body) else {
        return;
    };
    let Some(last) = parsed["last"].as_i64() else {
        return;
    };

    // Первый опрос после запуска только запоминает точку отсчёта: то, что приехало,
    // пока приложение было выключено, сыпать уведомлениями незачем.
    let first = cursor.is_none();
    *cursor = Some(last);
    if first {
        return;
    }

    let empty = Vec::new();
    let events = parsed["events"].as_array().unwrap_or(&empty);

    // Фокус спрашиваем один раз на порцию: за время разбора он всё равно не изменится,
    // а дёргать окно на каждое событие незачем.
    let focused = main_window_focused(app);

    let mut count = 0usize;
    // Внешний None — папку ещё не смотрели, внутренний — папки нет либо порция
    // разъехалась по разным папкам, и называть одну из них было бы враньём.
    let mut folder: Option<Option<&str>> = None;
    for event in events {
        let source = event["sourceType"].as_str().unwrap_or("");
        if !should_notify(source, focused) {
            continue;
        }
        count += 1;
        let name = event["folderName"].as_str();
        folder = match folder {
            None => Some(name),
            Some(previous) if previous == name => Some(previous),
            Some(_) => Some(None),
        };
    }
    if count == 0 {
        return;
    }

    let body = describe(count, folder.flatten());
    let _ = app.notification().builder().title("Копирка").body(body).show();
}

/// «Добавлен 1 файл», «Добавлено 3 файла», «Добавлено 11 файлов»; с папкой — «… в «Сэбач»».
fn describe(count: usize, folder: Option<&str>) -> String {
    let tail = count % 10;
    let hundred = count % 100;
    let single = tail == 1 && hundred != 11;
    let verb = if single { "Добавлен" } else { "Добавлено" };
    let noun = if single {
        "файл"
    } else if (2..=4).contains(&tail) && !(12..=14).contains(&hundred) {
        "файла"
    } else {
        "файлов"
    };
    match folder {
        Some(name) => format!("{verb} {count} {noun} в «{name}»"),
        None => format!("{verb} {count} {noun}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{describe, should_notify};

    #[test]
    fn external_sources_speak_always() {
        for source in ["folder_watch", "context_menu", "tab_screenshot", "area_screenshot"] {
            assert!(should_notify(source, true), "{source} промолчал при активном окне");
            assert!(should_notify(source, false), "{source} промолчал при скрытом окне");
        }
    }

    #[test]
    fn drag_and_paste_speak_only_when_window_is_away() {
        // Окно перед глазами — по перетаскиванию и ⌘V там уже показан свой тост.
        assert!(!should_notify("drag_drop", true));
        assert!(!should_notify("clipboard", true));
        // Окна не видно: файлы пришли быстрой командой Finder, сказать больше некому.
        assert!(should_notify("drag_drop", false));
        assert!(should_notify("clipboard", false));
    }

    #[test]
    fn unknown_source_stays_silent() {
        assert!(!should_notify("", true));
        assert!(!should_notify("", false));
        assert!(!should_notify("teleport", false));
    }

    #[test]
    fn russian_plurals() {
        assert_eq!(describe(1, None), "Добавлен 1 файл");
        assert_eq!(describe(2, None), "Добавлено 2 файла");
        assert_eq!(describe(4, None), "Добавлено 4 файла");
        assert_eq!(describe(5, None), "Добавлено 5 файлов");
        assert_eq!(describe(11, None), "Добавлено 11 файлов");
        assert_eq!(describe(12, None), "Добавлено 12 файлов");
        assert_eq!(describe(21, None), "Добавлен 21 файл");
        assert_eq!(describe(22, None), "Добавлено 22 файла");
        assert_eq!(describe(111, None), "Добавлено 111 файлов");
    }

    #[test]
    fn folder_is_named_when_known() {
        assert_eq!(describe(1, Some("Сэбач")), "Добавлен 1 файл в «Сэбач»");
        assert_eq!(describe(3, Some("Сэбач")), "Добавлено 3 файла в «Сэбач»");
    }
}

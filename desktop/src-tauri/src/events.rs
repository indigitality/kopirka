//! Уведомления о файлах, приехавших мимо окна: CAP-01, CAP-02, CAP-05, CAP-08.
//!
//! Раньше их слал `osascript` из Folder Action и быстрой команды Finder — и macOS
//! рисовала иконку Script Editor, а не «Копирки». Теперь источник уведомления один,
//! и это само приложение: сервер ведёт ленту событий (`GET /api/events`), оболочка
//! опрашивает её в цикле трея и показывает одно уведомление на порцию.
//!
//! Перетаскивание и ⌘V — на границе: когда окно перед глазами, оно показывает по ним
//! свой тост, и системное уведомление было бы вторым сообщением об одном и том же.
//! Когда окна не видно, тост показывать некому — а файлы всё равно приезжают, например
//! быстрой командой Finder «Добавить в Копирку». Поэтому решает фокус главного окна.
//!
//! В ленте два вида записей. `import` — файл прошёл конвейер: добавлен, добавлен с
//! пометкой похожести или отбит как точный дубль. Про дубль сказать так же важно, как
//! про успех: человек позвал импорт и должен услышать ответ, а не тишину. `notice` —
//! готовое сообщение от скрипта снаружи (`POST /api/notify`); его показываем всегда,
//! потому что сказать его больше некому — ради этого оно в ленту и попало.

use tauri::{AppHandle, Manager};

use crate::{http, notify};

/// Заголовок по умолчанию — и для сводок импорта, и для `notice` без своего заголовка.
const DEFAULT_TITLE: &str = "Копирка";

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

fn announce(title: &str, body: &str) {
    notify::show(title, body);
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

    let mut tally = Tally::default();
    for event in events {
        // Поля `kind` может не быть, если рядом оказался сервер прошлой версии:
        // такая запись — всегда импорт, `notice` появился вместе с полем.
        let kind = event["kind"].as_str().unwrap_or("import");
        if kind == "notice" {
            // Сообщение снаружи показываем как есть и по одному: тексты разные,
            // складывать их в сводку нечем.
            let Some(body) = event["body"].as_str() else {
                continue;
            };
            let title = event["title"].as_str().unwrap_or(DEFAULT_TITLE);
            announce(title, body);
            continue;
        }

        let source = event["sourceType"].as_str().unwrap_or("");
        if !should_notify(source, focused) {
            continue;
        }
        match event["outcome"].as_str().unwrap_or("") {
            "added" | "added_similar" => tally.add(event["folderName"].as_str()),
            "duplicate" => tally.duplicates += 1,
            _ => {}
        }
    }

    if let Some(body) = tally.describe() {
        announce(DEFAULT_TITLE, &body);
    }
}

/// Итог порции: сколько файлов легло в библиотеку, сколько уже там было и куда именно.
#[derive(Default)]
struct Tally<'a> {
    added: usize,
    duplicates: usize,
    /// Внешний None — папку ещё не смотрели, внутренний — папки нет либо порция
    /// разъехалась по разным папкам, и называть одну из них было бы враньём.
    folder: Option<Option<&'a str>>,
}

impl<'a> Tally<'a> {
    fn add(&mut self, folder: Option<&'a str>) {
        self.added += 1;
        // Папку копим только по добавленным: у дубля в событии лежит папка того файла,
        // который уже был, и к «куда положили сейчас» она отношения не имеет.
        self.folder = match self.folder {
            None => Some(folder),
            Some(previous) if previous == folder => Some(previous),
            Some(_) => Some(None),
        };
    }

    fn describe(&self) -> Option<String> {
        describe(self.added, self.duplicates, self.folder.flatten())
    }
}

/// Форма существительного при числе: 1 файл, 2 файла, 5 файлов.
fn noun(count: usize) -> &'static str {
    let tail = count % 10;
    let hundred = count % 100;
    if tail == 1 && hundred != 11 {
        "файл"
    } else if (2..=4).contains(&tail) && !(12..=14).contains(&hundred) {
        "файла"
    } else {
        "файлов"
    }
}

/// Форма прошедшего времени при числе: 1 был, 2 были, 5 было.
fn was(count: usize) -> &'static str {
    let tail = count % 10;
    let hundred = count % 100;
    if tail == 1 && hundred != 11 {
        "был"
    } else if (2..=4).contains(&tail) && !(12..=14).contains(&hundred) {
        "были"
    } else {
        "было"
    }
}

/// «Добавлен 1 файл», «Добавлено 3 файла в «Сэбач»», «1 файл уже есть в библиотеке»,
/// «Добавлено 2 файла · 1 уже был в библиотеке». None — говорить не о чем.
fn describe(added: usize, duplicates: usize, folder: Option<&str>) -> Option<String> {
    if added == 0 && duplicates == 0 {
        return None;
    }

    // Ничего не добавилось — тогда сообщение целиком про то, что файлы уже были.
    // Отдельная фраза, а не хвост к пустому началу: «есть» не требует согласования
    // по числу, и получается короче.
    if added == 0 {
        return Some(format!("{duplicates} {} уже есть в библиотеке", noun(duplicates)));
    }

    let verb = if noun(added) == "файл" { "Добавлен" } else { "Добавлено" };
    let mut text = format!("{verb} {added} {}", noun(added));
    if let Some(name) = folder {
        text.push_str(&format!(" в «{name}»"));
    }
    if duplicates > 0 {
        text.push_str(&format!(" · {duplicates} уже {} в библиотеке", was(duplicates)));
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::{describe, should_notify};

    /// Сокращение для читаемости тестов: только добавленные, без дублей.
    fn added(count: usize, folder: Option<&str>) -> String {
        describe(count, 0, folder).expect("порция с файлами промолчала")
    }

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
        assert_eq!(added(1, None), "Добавлен 1 файл");
        assert_eq!(added(2, None), "Добавлено 2 файла");
        assert_eq!(added(4, None), "Добавлено 4 файла");
        assert_eq!(added(5, None), "Добавлено 5 файлов");
        assert_eq!(added(11, None), "Добавлено 11 файлов");
        assert_eq!(added(12, None), "Добавлено 12 файлов");
        assert_eq!(added(21, None), "Добавлен 21 файл");
        assert_eq!(added(22, None), "Добавлено 22 файла");
        assert_eq!(added(111, None), "Добавлено 111 файлов");
    }

    #[test]
    fn folder_is_named_when_known() {
        assert_eq!(added(1, Some("Сэбач")), "Добавлен 1 файл в «Сэбач»");
        assert_eq!(added(3, Some("Сэбач")), "Добавлено 3 файла в «Сэбач»");
    }

    #[test]
    fn duplicates_only() {
        assert_eq!(describe(0, 1, None).unwrap(), "1 файл уже есть в библиотеке");
        assert_eq!(describe(0, 3, None).unwrap(), "3 файла уже есть в библиотеке");
        assert_eq!(describe(0, 7, None).unwrap(), "7 файлов уже есть в библиотеке");
        assert_eq!(describe(0, 21, None).unwrap(), "21 файл уже есть в библиотеке");
        // Папку в этой фразе не называем: файл никуда не клали.
        assert_eq!(describe(0, 2, Some("Сэбач")).unwrap(), "2 файла уже есть в библиотеке");
    }

    #[test]
    fn added_and_duplicates_together() {
        assert_eq!(describe(2, 1, None).unwrap(), "Добавлено 2 файла · 1 уже был в библиотеке");
        assert_eq!(describe(1, 2, None).unwrap(), "Добавлен 1 файл · 2 уже были в библиотеке");
        assert_eq!(describe(3, 5, None).unwrap(), "Добавлено 3 файла · 5 уже было в библиотеке");
        assert_eq!(describe(1, 11, None).unwrap(), "Добавлен 1 файл · 11 уже было в библиотеке");
        assert_eq!(describe(1, 21, None).unwrap(), "Добавлен 1 файл · 21 уже был в библиотеке");
        assert_eq!(
            describe(2, 1, Some("Сэбач")).unwrap(),
            "Добавлено 2 файла в «Сэбач» · 1 уже был в библиотеке"
        );
    }

    #[test]
    fn nothing_to_say() {
        assert!(describe(0, 0, None).is_none());
        assert!(describe(0, 0, Some("Сэбач")).is_none());
    }
}

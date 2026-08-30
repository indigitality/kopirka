//! Иконка в строке меню — главный вход в приложение.

use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::{backend, capture, http, windows};

/// Как часто перечитываем счётчик «Не разобрано».
const STATS_INTERVAL: Duration = Duration::from_secs(30);

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Показать библиотеку", true, None::<&str>)?;
    let capture_item = MenuItem::with_id(app, "capture", "Снять область", true, Some("Alt+Cmd+C"))?;
    let untagged = MenuItem::with_id(app, "untagged", "Не разобрано: —", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, Some("Cmd+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &capture_item,
            &PredefinedMenuItem::separator(app)?,
            &untagged,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // Шаблонная иконка: macOS сама красит её под светлую и тёмную строку меню.
    let icon = Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?;

    TrayIconBuilder::with_id("kopirka")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => windows::focus_main(app, false),
            "capture" => capture::start(app.clone()),
            "untagged" => windows::focus_main(app, true),
            "quit" => crate::quit(app),
            _ => {}
        })
        .build(app)?;

    spawn_stats_poller(app.clone(), untagged);
    Ok(())
}

fn spawn_stats_poller(app: AppHandle, item: MenuItem<Wry>) {
    std::thread::spawn(move || loop {
        let label = match untagged_count(backend::port()) {
            Some(count) => format!("Не разобрано: {count}"),
            // Сервер мог не ответить — не врём числом, показываем прочерк.
            None => "Не разобрано: —".to_string(),
        };
        let _ = item.set_text(label);
        // Приложение закрылось — поток должен уйти вместе с ним.
        if app.webview_windows().is_empty() && app.tray_by_id("kopirka").is_none() {
            return;
        }
        std::thread::sleep(STATS_INTERVAL);
    });
}

fn untagged_count(port: u16) -> Option<u64> {
    let response = http::get(port, "/api/stats").ok()?;
    if response.status != 200 {
        return None;
    }
    serde_json::from_slice::<serde_json::Value>(&response.body).ok()?["untagged"].as_u64()
}

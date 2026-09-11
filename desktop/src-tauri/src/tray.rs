//! Иконка в строке меню (macOS) и в области уведомлений (Windows) — главный вход
//! в приложение. Пункт «Снять область» есть только на macOS: захвата экрана (CAP-08)
//! в Windows-сборке нет, и пункт, ведущий в никуда, не показывается вовсе.

use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

#[cfg(target_os = "macos")]
use crate::capture;
#[cfg(target_os = "macos")]
use crate::shortcut;
use crate::{backend, events, http, windows};

/// Как часто ходим на сервер: за счётчиком «Не разобрано» и за лентой новых импортов.
/// Две секунды — компромисс: уведомление о скриншоте приходит почти сразу, а запрос
/// к своему же localhost стоит доли миллисекунды.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Показать библиотеку", true, None::<&str>)?;
    let untagged = MenuItem::with_id(app, "untagged", "Не разобрано: —", true, None::<&str>)?;
    // Акселератор пункта «Выйти» — только macOS: ⌘Q там и правда работает, его держит
    // меню приложения (menu.rs). На Windows меню нет, а «Cmd» muda разбирает как клавишу
    // Win — подпись «Win+Q» обещала бы сочетание, которого не существует.
    #[cfg(target_os = "macos")]
    let quit_accelerator = Some("Cmd+Q");
    #[cfg(not(target_os = "macos"))]
    let quit_accelerator = None::<&str>;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, quit_accelerator)?;

    // FDB-10 — подпись берётся из конфига, а не из константы: сочетание настраивается.
    // Хоткей к этому моменту уже зарегистрирован (main.rs::register_hotkey), поэтому
    // `accelerator()` вернёт ровно то, что и правда висит в системе.
    #[cfg(target_os = "macos")]
    let capture_item = MenuItem::with_id(
        app,
        "capture",
        "Снять область",
        true,
        shortcut::accelerator().as_deref(),
    )?;

    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<&dyn IsMenuItem<Wry>> = vec![&show];
    #[cfg(target_os = "macos")]
    items.push(&capture_item);
    items.extend([
        &first_separator as &dyn IsMenuItem<Wry>,
        &untagged,
        &second_separator,
        &quit,
    ]);
    let menu = Menu::with_items(app, &items)?;

    let mut tray = TrayIconBuilder::with_id("kopirka").menu(&menu);

    #[cfg(target_os = "macos")]
    {
        // Шаблонная иконка: macOS сама красит её под светлую и тёмную строку меню.
        tray = tray
            .icon(Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?)
            .icon_as_template(true)
            .show_menu_on_left_click(true);
    }
    #[cfg(windows)]
    {
        // Шаблонная иконка на Windows дала бы почти невидимое чёрное пятно: там никто
        // её не перекрашивает. Поэтому отдельный цветной файл — знак лаймом на прозрачном
        // фоне (icons/tray-windows.png, рисует scripts/make-icons.mjs).
        //
        // И другая привычка обращения: меню — по правой кнопке, левая сразу открывает окно.
        tray = tray
            .icon(Image::from_bytes(include_bytes!("../icons/tray-windows.png"))?)
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    windows::focus_main(tray.app_handle(), false);
                }
            });
    }

    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "show" => windows::focus_main(app, false),
        #[cfg(target_os = "macos")]
        "capture" => capture::start(),
        "untagged" => windows::focus_main(app, true),
        "quit" => crate::quit(app),
        _ => {}
    })
    .build(app)?;

    #[cfg(target_os = "macos")]
    spawn_poller(app.clone(), untagged, capture_item);
    #[cfg(not(target_os = "macos"))]
    spawn_poller(app.clone(), untagged);
    Ok(())
}

/// Единственный фоновый поток оболочки. Второй заводить незачем: все задачи —
/// короткий GET к локальному серверу (и чтение маленького config.json) с одинаковым
/// периодом.
///
/// FDB-10 добавила сюда третью задачу: сверить сочетание из конфига с тем, что
/// зарегистрировано. Отдельный канал «настройки → оболочка» не нужен — окно и так
/// пишет конфиг через сервер, а поллер уже ходит с нужной частотой.
fn spawn_poller(
    app: AppHandle,
    item: MenuItem<Wry>,
    #[cfg(target_os = "macos")] capture_item: MenuItem<Wry>,
) {
    std::thread::spawn(move || {
        // Номер последнего увиденного события. None — ещё не опрашивали.
        let mut cursor: Option<i64> = None;
        loop {
            let port = backend::port();
            let label = match untagged_count(port) {
                Some(count) => format!("Не разобрано: {count}"),
                // Сервер мог не ответить — не врём числом, показываем прочерк.
                None => "Не разобрано: —".to_string(),
            };
            let _ = item.set_text(label);
            events::poll(&app, port, &mut cursor);
            #[cfg(target_os = "macos")]
            {
                // `apply` сама выходит, если ничего не изменилось, — сравнение внутри.
                shortcut::apply(&app, backend::configured_capture_shortcut());
                let _ = capture_item.set_accelerator(shortcut::accelerator().as_deref());
            }
            // Приложение закрылось — поток должен уйти вместе с ним.
            if app.webview_windows().is_empty() && app.tray_by_id("kopirka").is_none() {
                return;
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

fn untagged_count(port: u16) -> Option<u64> {
    let response = http::get(port, "/api/stats").ok()?;
    if response.status != 200 {
        return None;
    }
    serde_json::from_slice::<serde_json::Value>(&response.body).ok()?["untagged"].as_u64()
}

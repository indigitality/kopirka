#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Десктопная «Копирка»: окно с интерфейсом, иконка в строке меню, глобальный хоткей
//! и локальный Node-сервер, который живёт ровно столько же, сколько приложение.

mod backend;
mod capture;
mod events;
mod http;
mod menu;
mod notify;
mod quickaction;
mod tray;
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Взведён на пути «Выйти»: пока false, закрытие окна только прячет его.
static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    backend::shutdown(app);
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        // Диалог выбора папки библиотеки: настройки и онбординг зовут его из интерфейса.
        .plugin(tauri_plugin_dialog::init())
        .manage(backend::BackendState::default())
        // Аварийное окно живёт на собственной схеме: у него нет ни сервера, ни IPC,
        // а кнопки — обычные ссылки, которые ловит этот же обработчик.
        .register_uri_scheme_protocol("kopirka", |ctx, request| match request.uri().path() {
            "/quit" => {
                let app = ctx.app_handle().clone();
                // Выход прямо из обработчика запроса подвесил бы главный поток.
                std::thread::spawn(move || quit(&app));
                no_content()
            }
            // Кнопка «Сбросить порт»: правим конфиг и перезапускаемся уже на 43117.
            "/reset-port" => match backend::reset_port() {
                Ok(()) => {
                    let app = ctx.app_handle().clone();
                    // Как и с выходом: перезапуск из главного потока подвесил бы его.
                    std::thread::spawn(move || app.restart());
                    no_content()
                }
                // Не вышло — объясняем причину в том же окне, без паники.
                Err(reason) => html_page(windows::error_html(
                    "Порт не сброшен",
                    &format!(
                        "Не удалось вернуть в конфиг порт {}.\n\
                         {reason}\n\
                         Поправьте ~/Library/Application Support/Kopirka/config.json руками, \
                         поле serverPort, и откройте «Копирку» заново.",
                        backend::DEFAULT_PORT
                    ),
                    None,
                )),
            },
            _ => html_page(windows::error_page()),
        })
        .on_menu_event(|app, event| {
            if event.id() == menu::QUIT_ID {
                quit(app);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Меню ставим до всего: ⌘Q должен работать и в аварийном окне.
            menu::setup(&handle)?;
            match backend::start(&handle) {
                Ok(port) => start_ui(&handle, port)?,
                // На порту отвечает «Копирка» — своя же, поднятая из терминала или
                // вторым экземпляром. Второй сервер не нужен: показываем интерфейс той.
                // Гасить её при выходе не будем — в BackendState пусто, гасить нечего.
                Err(backend::StartError::PortBusy(port)) if backend::health(port) => {
                    start_ui(&handle, port)?
                }
                // Порт занял кто-то посторонний. Честно об этом говорим и даём кнопку,
                // которая вернёт в конфиг стандартный порт.
                Err(backend::StartError::PortBusy(port)) => {
                    let default = backend::DEFAULT_PORT;
                    let reset = format!("Сбросить порт на {default}");
                    windows::open_error(
                        &handle,
                        "Порт занят — Копирка не запустилась",
                        &format!(
                            "Порт {port} занят другой программой.\n\
                             Сбросьте порт на {default} или закройте программу, которая его заняла.\n\
                             Порт хранится в ~/Library/Application Support/Kopirka/config.json, поле serverPort."
                        ),
                        Some((&reset, windows::RESET_PORT_HREF)),
                    )?
                }
                Err(backend::StartError::Failed(message)) => windows::open_error(
                    &handle,
                    "Копирка не запустилась",
                    &format!(
                        "Не удалось поднять локальный сервер библиотеки.\n\
                         {message}\n\
                         Подробности — в ~/Library/Application Support/Kopirka/kopirka.log."
                    ),
                    None,
                )?,
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    // Приложение живёт в строке меню: крестик прячет окно, а не гасит всё.
                    "main" if !QUITTING.load(Ordering::SeqCst) => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // Аварийное окно — единственное, что есть у пользователя. Закрыл — вышел.
                    "error" => quit(&window.app_handle().clone()),
                    _ => {}
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("не удалось собрать приложение")
        .run(|app, event| match event {
            // Закрылось последнее окно — это не повод выходить: живём в строке меню.
            // Но если выход затеян осознанно, мешать нельзя.
            RunEvent::ExitRequested { code, api, .. }
                if code.is_none() && !QUITTING.load(Ordering::SeqCst) =>
            {
                api.prevent_exit()
            }
            // Страховка: сюда приходит и штатный выход, и ⌘Q через системное меню.
            RunEvent::Exit => backend::shutdown(app),
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => windows::focus_main(app, false),
            _ => {}
        });
}

/// Пустой ответ обработчика схемы: страница аварийного окна остаётся на месте.
fn no_content() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder().status(204).body(Vec::new()).unwrap()
}

fn html_page(body: String) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .body(body.into_bytes())
        .unwrap()
}

/// Всё, что нужно для работы поверх живого сервера: окно, иконка строки меню и хоткей.
/// Порт передаётся явно — он может быть и не наш, если мы подключились к чужому серверу.
fn start_ui(app: &AppHandle, port: u16) -> tauri::Result<()> {
    windows::open_main(app, port)?;
    tray::setup(app)?;
    register_hotkey(app)?;
    // Пункт Finder «Добавить в Копирку» — в фоне и после окна: он никому не нужен
    // раньше, чем приложение видно, а его отсутствие — не повод не запускаться.
    quickaction::ensure_installed();
    // Разрешение на баннеры: система спросит один раз за установку. Без запроса
    // UNUserNotificationCenter молча выбрасывает всё, что мы ему отдадим.
    notify::request_authorization();
    Ok(())
}

/// ⌥⌘C в любом приложении — снимок выделенной области.
fn register_hotkey(app: &AppHandle) -> tauri::Result<()> {
    let hotkey = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyC);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, event| {
                if event.state() == ShortcutState::Pressed && shortcut == &hotkey {
                    capture::start();
                }
            })
            .build(),
    )?;
    if let Err(error) = app.global_shortcut().register(hotkey) {
        // Хоткей мог занять кто-то другой — это не повод не запускаться.
        eprintln!("не удалось зарегистрировать ⌥⌘C: {error}");
    }
    Ok(())
}

/// Капабилити `default` открывает IPC для интерфейса с `http://127.0.0.1:<порт>`
/// (решение D4). Порт настраиваемый, поэтому шаблон адреса — со звёздочкой; проверяем,
/// что он и правда покрывает любой порт и не задевает посторонние адреса.
#[cfg(test)]
mod capability_tests {
    use std::str::FromStr;
    use tauri::utils::acl::RemoteUrlPattern;

    const CAPABILITY: &str = include_str!("../capabilities/default.json");

    fn patterns() -> Vec<RemoteUrlPattern> {
        let parsed: serde_json::Value = serde_json::from_str(CAPABILITY).unwrap();
        parsed["remote"]["urls"]
            .as_array()
            .expect("в капабилити нет блока remote.urls")
            .iter()
            .map(|url| RemoteUrlPattern::from_str(url.as_str().unwrap()).unwrap())
            .collect()
    }

    fn allows(url: &str) -> bool {
        let url = url.parse().unwrap();
        patterns().iter().any(|pattern| pattern.test(&url))
    }

    #[test]
    fn ipc_open_for_local_server_on_any_port() {
        assert!(allows("http://127.0.0.1:43117/"));
        assert!(allows("http://127.0.0.1:43317/library"));
        assert!(allows("http://localhost:43117/"));
    }

    #[test]
    fn ipc_closed_for_everything_else() {
        assert!(!allows("http://example.com/"));
        assert!(!allows("https://127.0.0.1.evil.com/"));
        assert!(!allows("http://192.168.1.10:43117/"));
    }
}

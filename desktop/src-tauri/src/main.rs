#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Десктопная «Копирка»: окно с интерфейсом, иконка в строке меню, глобальный хоткей
//! и локальный Node-сервер, который живёт ровно столько же, сколько приложение.

mod backend;
mod capture;
mod http;
mod menu;
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
        .plugin(tauri_plugin_notification::init())
        .manage(backend::BackendState::default())
        // Аварийное окно живёт на собственной схеме: у него нет ни сервера, ни IPC,
        // а кнопка «Выйти» — обычная ссылка, которую ловит этот же обработчик.
        .register_uri_scheme_protocol("kopirka", |ctx, request| {
            if request.uri().path() == "/quit" {
                let app = ctx.app_handle().clone();
                // Выход прямо из обработчика запроса подвесил бы главный поток.
                std::thread::spawn(move || quit(&app));
                return tauri::http::Response::builder().status(204).body(Vec::new()).unwrap();
            }
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(windows::error_page().into_bytes())
                .unwrap()
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
                Ok(port) => {
                    windows::open_main(&handle, port)?;
                    tray::setup(&handle)?;
                    register_hotkey(&handle)?;
                }
                Err(backend::StartError::PortBusy(port)) => windows::open_error(
                    &handle,
                    "Порт занят — Копирка не запустилась",
                    &format!(
                        "Порт {port} на 127.0.0.1 уже занят другой программой.\n\
                         Скорее всего, «Копирка» уже запущена — вторым экземпляром или из терминала командой npm start.\n\
                         Закройте её и откройте приложение заново. Порт можно сменить в ~/Library/Application Support/Kopirka/config.json, поле serverPort."
                    ),
                )?,
                Err(backend::StartError::Failed(message)) => windows::open_error(
                    &handle,
                    "Копирка не запустилась",
                    &format!(
                        "Не удалось поднять локальный сервер библиотеки.\n\
                         {message}\n\
                         Подробности — в ~/Library/Application Support/Kopirka/kopirka.log."
                    ),
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

/// ⌥⌘C в любом приложении — снимок выделенной области.
fn register_hotkey(app: &AppHandle) -> tauri::Result<()> {
    let hotkey = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyC);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() == ShortcutState::Pressed && shortcut == &hotkey {
                    capture::start(app.clone());
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

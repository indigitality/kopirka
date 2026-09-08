//! Меню приложения. Своё, а не тауриевское по умолчанию, по двум причинам:
//! стандартное целиком на английском, а его «Quit» шлёт `terminate:` мимо нашего
//! кода — сервер тогда гасится не нами, а как повезёт.
//!
//! И только для macOS. На Windows строки меню у приложения нет вовсе: меню жило бы
//! внутри окна, поверх тёмного интерфейса, а половина пунктов (`services`,
//! `hide_others`, `show_all`) там просто не существует и вышла бы мёртвыми строками.
//! Клавиатурная правка от этого не страдает: WebView2 сам обрабатывает Ctrl+C, Ctrl+V
//! и Ctrl+A внутри вебвью, в отличие от WKWebView, которому нужен пункт меню
//! в цепочке отклика (ради него меню на macOS и появилось — см. CAP-04).

pub const QUIT_ID: &str = "app-quit";

#[cfg(target_os = "macos")]
pub fn setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{
        AboutMetadataBuilder, MenuBuilder, MenuItem, PredefinedMenuItem as P, SubmenuBuilder,
    };

    let quit = MenuItem::with_id(app, QUIT_ID, "Выйти из Копирки", true, Some("Cmd+Q"))?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Копирка"))
        .version(Some(app.package_info().version.to_string()))
        .copyright(Some("© Сергей Оршак"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Копирка")
        .item(&P::about(app, Some("О Копирке"), Some(about))?)
        .separator()
        .item(&P::services(app, Some("Службы"))?)
        .separator()
        .item(&P::hide(app, Some("Скрыть Копирку"))?)
        .item(&P::hide_others(app, Some("Скрыть остальные"))?)
        .item(&P::show_all(app, Some("Показать все"))?)
        .separator()
        .item(&quit)
        .build()?;

    // Пункты правки нужны не для красоты: без них ⌘V, ⌘C и ⌘A не доходят до вебвью,
    // а вставка из буфера — штатный способ импорта (CAP-04).
    let edit_menu = SubmenuBuilder::new(app, "Правка")
        .item(&P::undo(app, Some("Отменить"))?)
        .item(&P::redo(app, Some("Повторить"))?)
        .separator()
        .item(&P::cut(app, Some("Вырезать"))?)
        .item(&P::copy(app, Some("Копировать"))?)
        .item(&P::paste(app, Some("Вставить"))?)
        .item(&P::select_all(app, Some("Выбрать всё"))?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Окно")
        .item(&P::minimize(app, Some("Свернуть"))?)
        .item(&P::fullscreen(app, Some("Во весь экран"))?)
        .separator()
        .item(&P::close_window(app, Some("Закрыть окно"))?)
        .build()?;

    let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu, &window_menu]).build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// Вне macOS меню не ставим. Выход остаётся один и тот же — пункт трея «Выйти».
#[cfg(not(target_os = "macos"))]
pub fn setup(_app: &tauri::AppHandle) -> tauri::Result<()> {
    Ok(())
}

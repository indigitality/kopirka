//! Окна приложения: главное (интерфейс с локального сервера) и аварийное.

use std::sync::Mutex;

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, Wry};

/// Текст аварийного окна. Готовится до создания окна, читается обработчиком `kopirka://`.
static ERROR_TEXT: Mutex<String> = Mutex::new(String::new());

/// Начало адресов аварийного окна.
///
/// На macOS и Linux WKWebView и WebKitGTK умеют собственные схемы, и окно живёт прямо
/// на `kopirka://localhost/...`. WebView2 нестандартных схем не понимает, поэтому wry
/// (0.55.1, `custom_protocol_workaround.rs`) подменяет схему на `http://kopirka.localhost/...`
/// и разворачивает подмену обратно перед вызовом обработчика — так что `request.uri().path()`
/// в `main.rs` на обеих системах один и тот же. Но подменяется только стартовый адрес окна:
/// ссылки внутри страницы мы обязаны выписать сами, иначе кнопки «Выйти» и «Сбросить порт»
/// уехали бы в никуда (а `kopirka://` — ещё и во внешний браузер).
#[cfg(not(windows))]
const SCHEME_ORIGIN: &str = "kopirka://localhost";
#[cfg(windows)]
const SCHEME_ORIGIN: &str = "http://kopirka.localhost";

/// Хост подменённой схемы. Свой адрес по нему узнаёт `is_own_url`.
#[cfg(windows)]
const SCHEME_HOST: &str = "kopirka.localhost";

/// Адрес кнопки «Сбросить порт»: путь ловит обработчик схемы `kopirka://` в `main.rs`.
#[cfg(not(windows))]
pub const RESET_PORT_HREF: &str = "kopirka://localhost/reset-port";
#[cfg(windows)]
pub const RESET_PORT_HREF: &str = "http://kopirka.localhost/reset-port";

/// Левый верхний угол кнопки «закрыть» от левого верхнего угла окна (семантика tao).
/// Только macOS: на Windows титлбар системный, и двигать в нём нечего.
///
/// x = 20 — это поле окна 12 плюс внутреннее поле панели 8: кнопки встают ровно
/// на левый край строк сайдбара, а не «примерно рядом» с ними.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_X: f64 = 20.0;
/// y — НЕ отступ кружка от верха окна, хотя название и позиция в API намекают именно
/// на это. В tao (0.35.3, macos/view.rs:1152 `inset_traffic_lights`) по y меняется
/// только высота контейнера титлбара — `close.height + y`, — а сами кнопки внутри него
/// по вертикали не двигаются. Верх кружка получается примерно `y - 9`.
///
/// 20 подобрано замером на macOS 26: кружок занимает ~11–24.5, то есть его центр
/// встаёт на середину полосы в 36 px. Ставили 12 «по смыслу отступа» — кружок уезжал
/// на 3–16.5 и почти липнул к краю окна.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_Y: f64 = 20.0;

/// Высота собственной полосы светофора: 12 (поле сверху) + 12 (кнопки) + 12 (зазор).
/// Кружки macOS чуть крупнее номинальных 12 (по замеру ~13.5) и стоят по центру полосы.
/// Веб берёт её как `padding-top: var(--kopirka-titlebar-inset, var(--shell-pad))` —
/// панели оболочки, настроек и онбординга начинаются под кнопками, а не за ними.
const TITLEBAR_STRIP_PX: u32 = 36;

/// Значение `data-kopirka-platform` на `:root`. Интерфейс по нему решает, что рисовать:
/// на macOS у окна свой титлбар и кнопки светофора внутри страницы, на Windows —
/// системная полоса заголовка, и никаких отступов под неё веб не делает.
#[cfg(target_os = "macos")]
pub const PLATFORM: &str = "macos";
#[cfg(windows)]
pub const PLATFORM: &str = "windows";

/// Скрипт инициализации главного окна.
///
/// Веб-интерфейс нарисован без полосы заголовка, а `titleBarStyle: Overlay` кладёт
/// кнопки светофора прямо поверх сайдбара. Правим это здесь, а не в `web/src`:
/// десктопная особенность не должна протекать в браузерную сборку.
///
/// Скрипт один на обе системы, ветка внутри — по `PLATFORM`. Так его видно целиком,
/// и не приходится держать две почти одинаковые заготовки.
const INIT_SCRIPT: &str = r#"
(function () {
  var STRIP = __STRIP__;
  var PLATFORM = '__PLATFORM__';

  // Сигнал вебу «мы внутри оболочки, и вот на какой системе», а не в браузере.
  document.documentElement.dataset.kopirkaPlatform = PLATFORM;

  // Полоса под светофор — только macOS. На Windows титлбар системный, отступ сверху
  // интерфейсу не нужен, и переменную мы не ставим вовсе: в CSS есть свой фолбэк.
  if (PLATFORM === 'macos') {
    // Синхронно, до первого кадра и без ожиданий: переменную на :root читает CSS веба,
    // а не мы. Она спокойно дожидается своего бандла — тот подставит её сам, когда
    // приедет. Ждать CSS понадобилось бы, только если считать от чужого значения:
    // так и было со старым хаком, который прибавлял 28 px к --size-topbar.
    document.documentElement.style.setProperty('--kopirka-titlebar-inset', STRIP + 'px');
    document.documentElement.dataset.kopirkaInset = String(STRIP);
  }

  // Пункт трея «Не разобрано» открывает соответствующий раздел. Стора наружу нет,
  // поэтому жмём ту же кнопку сайдбара, что и пользователь.
  window.__kopirkaShowUntagged = function () {
    var attempt = 0;
    (function click() {
      var buttons = document.querySelectorAll('nav button');
      for (var i = 0; i < buttons.length; i++) {
        if ((buttons[i].textContent || '').trim().indexOf('Не разобрано') === 0) {
          buttons[i].click();
          return;
        }
      }
      if (++attempt < 60) setTimeout(click, 150);
    })();
  };
})();
"#;

fn init_script() -> String {
    INIT_SCRIPT
        .replace("__STRIP__", &TITLEBAR_STRIP_PX.to_string())
        .replace("__PLATFORM__", PLATFORM)
}

/// Свой ли это адрес: интерфейс с локального сервера или собственная схема окна ошибки.
/// Порт настраиваемый, поэтому проверяем только хост.
fn is_own_url(url: &Url) -> bool {
    match url.scheme() {
        "http" => match url.host_str() {
            Some("127.0.0.1") | Some("localhost") => true,
            // Своя схема на Windows приезжает подменённой — см. SCHEME_ORIGIN.
            // Без этой ветки кнопки аварийного окна уехали бы во внешний браузер.
            #[cfg(windows)]
            Some(host) => host == SCHEME_HOST,
            _ => false,
        },
        "kopirka" => true,
        _ => false,
    }
}

/// Отдать адрес системному браузеру. Схемы, кроме http(s), наружу не выпускаем:
/// «Копирка» не должна чужими руками открывать файлы и сторонние приложения.
fn open_externally(url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        return;
    }
    #[cfg(not(windows))]
    if let Err(error) = std::process::Command::new("open").arg(url.as_str()).spawn() {
        crate::diag!("не удалось открыть ссылку в браузере: {error}");
    }
    #[cfg(windows)]
    open_in_shell(url.as_str());
}

/// Открыть адрес тем, что назначено в системе. `ShellExecuteW`, а не `tauri-plugin-opener`
/// и не `cmd /c start`: плагин пришлось бы тянуть целиком ради одного вызова, а `cmd`
/// разбирает `&` и `^` в адресе как свои метасимволы.
#[cfg(windows)]
fn open_in_shell(url: &str) {
    use std::ffi::{c_void, OsStr};
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            window: *mut c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show: i32,
        ) -> *mut c_void;
    }

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
    }

    let operation = wide("open");
    let file = wide(url);
    // SW_SHOWNORMAL = 1. Возврат больше 32 — успех, это документированная (и странная)
    // семантика ShellExecuteW: там, где у всех HRESULT, у неё псевдо-HINSTANCE.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if result as isize <= 32 {
        crate::diag!("не удалось открыть ссылку в браузере: ShellExecuteW → {}", result as isize);
    }
}

/// Тёмная полоса заголовка и рамка. Титлбар на Windows системный — свой мы не рисуем
/// (это чужеродно и ломает привязку окна к менеджеру окон), но белая полоса поверх
/// тёмного интерфейса била бы по канону. DWM умеет покрасить её сам.
///
/// `DWMWA_USE_IMMERSIVE_DARK_MODE` = 20 начиная с Windows 10 2004 (сборка 19041);
/// в 1809–1903 у того же атрибута был номер 19. Пробуем оба и жалуемся только тогда,
/// когда не принят ни один: на более старых сборках полоса просто останется светлой.
#[cfg(windows)]
fn dark_titlebar(window: &WebviewWindow<Wry>) {
    use std::ffi::c_void;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            window: *mut c_void,
            attribute: u32,
            value: *const c_void,
            size: u32,
        ) -> i32;
    }

    const DARK_MODE: u32 = 20;
    const DARK_MODE_PRE_20H1: u32 = 19;

    let Ok(handle) = window.hwnd() else {
        crate::diag!("тёмная рамка окна не поставлена: у окна нет HWND");
        return;
    };
    let enabled: i32 = 1; // BOOL TRUE
    let value = std::ptr::addr_of!(enabled) as *const c_void;
    let size = std::mem::size_of::<i32>() as u32;
    let accepted = [DARK_MODE, DARK_MODE_PRE_20H1].into_iter().any(|attribute| {
        // S_OK == 0.
        unsafe { DwmSetWindowAttribute(handle.0, attribute, value, size) == 0 }
    });
    if !accepted {
        crate::diag!("тёмная рамка окна не поставлена: DwmSetWindowAttribute отказал");
    }
}

pub fn open_main(app: &AppHandle, port: u16) -> tauri::Result<WebviewWindow<Wry>> {
    let url = format!("http://127.0.0.1:{port}/");
    #[allow(unused_mut)]
    let mut builder =
        WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
            .title("Копирка")
            .inner_size(1440.0, 900.0)
            .min_inner_size(900.0, 600.0)
            // Тёмный фон окна: иначе при запуске мигает белым до первого кадра.
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .initialization_script(init_script())
            // Нативный обработчик перетаскивания отдаём странице. Тот, что ставит Tauri
            // (tauri-runtime-wry 2.11.4, lib.rs:4862–4896), всегда возвращает `true`, а
            // wry (wkwebview/drag_drop.rs) зовёт оригинальный performDragOperation только
            // при `false`. Из-за этого до страницы не доходили ни dragover/drop внутреннего
            // переноса, ни внешний drop файлов из Finder — зона сброса в окне не работала.
            //
            // На Windows этот вызов нужен ещё сильнее, и по той же причине. wry
            // (webview2/drag_drop.rs:68–74) на каждое дочернее окно зовёт `RevokeDragDrop`
            // и ставит свой `IDropTarget` — то есть отбирает приём файлов у самого WebView2.
            // Обработчик Tauri снова вернул бы `true`, и до страницы не дошло бы ничего.
            // Отключённый обработчик означает, что wry не трогает WebView2 вовсе и drop
            // файлов из Проводника доходит до вебвью штатным путём.
            .disable_drag_drop_handler()
            // Ссылка без target увела бы само окно на чужой сайт — вернуться оттуда
            // нечем: ни адресной строки, ни кнопки «назад» у нас нет.
            .on_navigation(|url| {
                if is_own_url(url) {
                    return true;
                }
                open_externally(url);
                false
            })
            // `<a target="_blank">` из панели «Источник». Без этого обработчика
            // WKWebView молча не делает ничего — аудит 02.09.2026, пункт 3.
            .on_new_window(|url, _features| {
                open_externally(&url);
                NewWindowResponse::Deny
            })
            .center();

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            // Своя полоса вместо наезда на сайдбар: кнопки встают по нашим координатам,
            // а веб отступает от них на TITLEBAR_STRIP_PX. Требует Overlay и включённых
            // decorations — оба условия здесь выполнены. Про смысл y — у константы.
            .traffic_light_position(tauri::LogicalPosition::new(
                TRAFFIC_LIGHT_X,
                TRAFFIC_LIGHT_Y,
            ));
    }

    let window = builder.build()?;
    // Титлбар на Windows системный: ни Overlay, ни своих кнопок окна. Красим только рамку.
    #[cfg(windows)]
    dark_titlebar(&window);
    Ok(window)
}

/// Показать и сфокусировать главное окно; `untagged` — сразу открыть «Не разобрано».
pub fn focus_main(app: &AppHandle, untagged: bool) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    if untagged {
        let _ = window.eval("window.__kopirkaShowUntagged && window.__kopirkaShowUntagged()");
    }
}

/// Аварийное окно. `extra` — дополнительная кнопка рядом с «Выйти»: подпись и адрес
/// схемы `kopirka://`, который разбирает `main.rs`.
pub fn open_error(
    app: &AppHandle,
    title: &str,
    body: &str,
    extra: Option<(&str, &str)>,
) -> tauri::Result<()> {
    *ERROR_TEXT.lock().unwrap() = error_html(title, body, extra);
    // Адрес пишем в исходном виде и на Windows: подмену на http://kopirka.localhost/error
    // делает wry сам при создании вебвью.
    let url: Url = "kopirka://localhost/error".parse().unwrap();
    let window = WebviewWindowBuilder::new(app, "error", WebviewUrl::CustomProtocol(url))
        .title("Копирка")
        .inner_size(560.0, 380.0)
        .resizable(false)
        .center()
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()?;
    #[cfg(windows)]
    dark_titlebar(&window);
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}

pub fn error_page() -> String {
    ERROR_TEXT.lock().unwrap().clone()
}

/// Экранирование и для текста, и для значения атрибута — отсюда кавычка.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Аварийная страница. Кнопки — обычные ссылки: обработчик схемы `kopirka://` ловит
/// путь `/quit` или `/reset-port` и делает своё дело, JS-мост для этого не нужен.
/// Начало адреса зависит от системы — см. `SCHEME_ORIGIN`.
pub fn error_html(title: &str, body: &str, extra: Option<(&str, &str)>) -> String {
    let paragraphs = body
        .split('\n')
        .filter(|line| !line.trim().is_empty())
        .map(|line| format!("<p>{}</p>", escape(line)))
        .collect::<Vec<_>>()
        .join("");
    let extra_button = extra
        .map(|(label, href)| {
            format!(r#"<a class="button second" href="{}">{}</a>"#, escape(href), escape(label))
        })
        .unwrap_or_default();
    format!(
        r#"<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Копирка</title><style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b0b0c; color: #ededf0; padding: 40px 44px;
    font: 400 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", sans-serif;
    -webkit-user-select: none; user-select: none;
  }}
  main {{ max-width: 420px; }}
  h1 {{ margin: 0 0 12px; font-size: 18px; font-weight: 500; letter-spacing: -0.01em; }}
  p {{ margin: 0 0 10px; color: #a0a0a8; }}
  nav {{ display: flex; gap: 10px; align-items: center; margin-top: 18px; }}
  a.button {{
    display: inline-block; padding: 0 16px; height: 32px; line-height: 32px;
    border-radius: 8px; background: #3ddbb0; color: #04231b; text-decoration: none; font-weight: 500;
  }}
  a.second {{ background: transparent; color: #ededf0; box-shadow: inset 0 0 0 1px #2e2e33; }}
</style></head>
<body><main><h1>{}</h1>{}
<nav><a class="button" href="{}/quit">Выйти</a>{}</nav>
</main></body></html>"#,
        escape(title),
        paragraphs,
        SCHEME_ORIGIN,
        extra_button
    )
}

#[cfg(test)]
mod tests {
    use super::{error_html, init_script, PLATFORM, RESET_PORT_HREF, SCHEME_ORIGIN};

    /// Веб читает `data-kopirka-platform`, чтобы понять, рисовать ли отступ под светофор.
    /// Заодно проверяем, что подстановка вообще случилась: `__PLATFORM__` в живом
    /// скрипте — это молча сломанная оболочка.
    #[test]
    fn init_script_carries_platform() {
        let script = init_script();
        assert!(!script.contains("__PLATFORM__"));
        assert!(!script.contains("__STRIP__"));
        assert!(script.contains(&format!("var PLATFORM = '{PLATFORM}';")));
        assert!(script.contains("dataset.kopirkaPlatform = PLATFORM"));
        // Полосу светофора ставит ветка `PLATFORM === 'macos'`, и только она.
        assert!(script.contains("if (PLATFORM === 'macos')"));
    }

    /// Инсет — только macOS: на Windows титлбар системный, и переменной быть не должно.
    #[test]
    fn titlebar_inset_is_macos_only() {
        assert_eq!(PLATFORM == "macos", cfg!(target_os = "macos"));
    }

    /// Кнопки аварийного окна должны вести на ту же схему, на которой окно открыто.
    #[test]
    fn error_buttons_point_at_own_scheme() {
        let html = error_html("Порт занят", "Строка", Some(("Сбросить", RESET_PORT_HREF)));
        assert!(html.contains(&format!(r#"href="{SCHEME_ORIGIN}/quit""#)));
        assert!(html.contains(&format!(r#"href="{SCHEME_ORIGIN}/reset-port""#)));
        assert!(RESET_PORT_HREF.starts_with(SCHEME_ORIGIN));
    }
}

//! Окна приложения: главное (интерфейс с локального сервера) и аварийное.

use std::sync::Mutex;

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, Wry};

/// Текст аварийного окна. Готовится до создания окна, читается обработчиком `kopirka://`.
static ERROR_TEXT: Mutex<String> = Mutex::new(String::new());

/// Адрес кнопки «Сбросить порт»: путь ловит обработчик схемы `kopirka://` в `main.rs`.
pub const RESET_PORT_HREF: &str = "kopirka://localhost/reset-port";

/// Насколько опустить шапку интерфейса, чтобы светофор не наехал на логотип.
const TITLEBAR_INSET_PX: u32 = 28;

/// Скрипт инициализации главного окна.
///
/// Веб-интерфейс нарисован без полосы заголовка, а `titleBarStyle: Overlay` кладёт
/// кнопки светофора прямо поверх сайдбара. Правим это здесь, а не в `web/src`:
/// десктопная особенность не должна протекать в браузерную сборку.
const INIT_SCRIPT: &str = r#"
(function () {
  var INSET = __INSET__;

  // Токены приходят вместе с CSS-бандлом, то есть позже старта скрипта.
  // Ждём появления --size-topbar и сдвигаем шапку ровно один раз.
  var tries = 0;
  var timer = setInterval(function () {
    var root = document.documentElement;
    if (root.dataset.kopirkaInset) { clearInterval(timer); return; }
    var base = getComputedStyle(root).getPropertyValue('--size-topbar').trim();
    if (base) {
      root.dataset.kopirkaInset = String(INSET);
      root.style.setProperty('--kopirka-titlebar-inset', INSET + 'px');
      root.style.setProperty('--size-topbar', 'calc(' + base + ' + ' + INSET + 'px)');
      clearInterval(timer);
    } else if (++tries > 200) {
      clearInterval(timer);
    }
  }, 25);

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
    INIT_SCRIPT.replace("__INSET__", &TITLEBAR_INSET_PX.to_string())
}

/// Свой ли это адрес: интерфейс с локального сервера или собственная схема окна ошибки.
/// Порт настраиваемый, поэтому проверяем только хост.
fn is_own_url(url: &Url) -> bool {
    match url.scheme() {
        "http" => matches!(url.host_str(), Some("127.0.0.1") | Some("localhost")),
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
    if let Err(error) = std::process::Command::new("open").arg(url.as_str()).spawn() {
        eprintln!("не удалось открыть ссылку в браузере: {error}");
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
            .hidden_title(true);
    }

    builder.build()
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
    let url: Url = "kopirka://localhost/error".parse().unwrap();
    WebviewWindowBuilder::new(app, "error", WebviewUrl::CustomProtocol(url))
        .title("Копирка")
        .inner_size(560.0, 380.0)
        .resizable(false)
        .center()
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .build()?;
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
    font: 400 14px/1.55 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
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
<nav><a class="button" href="kopirka://localhost/quit">Выйти</a>{}</nav>
</main></body></html>"#,
        escape(title),
        paragraphs,
        extra_button
    )
}

//! Системные уведомления через UNUserNotificationCenter.
//!
//! Раньше это делал `tauri-plugin-notification`. На macOS он ходит в notify-rust →
//! mac-notification-sys, а тот — в `NSUserNotificationCenter`, объявленный устаревшим
//! ещё в macOS 11. Хуже другого: плагин глотает обе ошибки (`let _ = set_application`,
//! `let _ = notification.show()`), поэтому наружу не выходило вообще ничего. На macOS
//! 26.5.1 баннеров не было ни одного, «Копирка» не завелась даже в списке приложений
//! Центра уведомлений (`com.apple.ncprefs`), и причину было не увидеть.
//!
//! Плагин снят, показ переписан на живой `UNUserNotificationCenter`. Он, в отличие от
//! плагина, отвечает внятной ошибкой — и она сразу показала настоящую причину: бандл
//! выходил из `tauri build` без подписи, а неподписанному приложению система отказывает
//! в разрешении на уведомления. Про это и про требование единственной копии на машине —
//! в desktop/README.md, раздел «Уведомления».
//!
//! Зовём через рантайм (`AnyClass::get` + `msg_send!`), а не через типизированный
//! `objc2-user-notifications`: `objc2`, `objc2-foundation` и `block2` уже лежат в
//! дереве зависимостей ради tao и wry, а новый крейт пришлось бы тянуть отдельно.
//!
//! Про надёжность — честно, что проверено. Обычные ответы UN* мы переживаем спокойно:
//! запуск голым бинарником из `Contents/MacOS` даёт «Notifications are not allowed for
//! this application» в completion-обработчике, приложение работает дальше.
//!
//! Один случай не лечится нашими силами: если LaunchServices не может назвать
//! идентификатор бандла запущенного процесса (битая или устаревшая регистрация,
//! подменённый исполняемый файл), `currentNotificationCenter` бросает
//! NSInternalInconsistencyException — и `objc2::exception::catch` его не поймает,
//! потому что бросок происходит внутри `dispatch_once`, а `_dispatch_client_callout`
//! исключения наружу не пропускает и гасит процесс сам. Предсказать это заранее нечем:
//! UN* смотрит на `bundleProxyForCurrentProcess` (приватный API), и ни
//! `NSRunningApplication.currentApplication.bundleIdentifier`, ни сверка
//! `NSBundle.mainBundle.executablePath` с `current_exe()` этот случай не выявляют —
//! проверено 03.09.2026, обе проверки проходят, а UN* всё равно бросает. Лечится
//! нормально собранным и установленным `.app`, а не кодом здесь.
//!
//! `catch` тем не менее оставлен: остальные пути (`show`) исключения пропускают обычно.
//!
//! На Windows всё иначе и проще. Там у плагина под капотом WinRT-тост, а не мёртвый API,
//! поэтому баннеры показывает `tauri-plugin-notification` — он подключён только в
//! Windows-сборке (`Cargo.toml`, `[target.'cfg(windows)'.dependencies]`). Разрешения
//! спрашивать не нужно: на десктопе плагин всегда отвечает `Granted`, потому что
//! системного запроса на уведомления в Windows нет.
//!
//! Зато есть своё условие, и его не обойти кодом: WinRT-тост принадлежит не процессу,
//! а зарегистрированному AppUserModelID, а AUMID появляется вместе с ярлыком в меню
//! «Пуск». То есть уведомления работают у приложения, поставленного установщиком
//! (NSIS кладёт ярлык и прописывает `System.AppUserModel.ID`), и молчат у бинарника,
//! запущенного из папки сборки. Плагин это учитывает сам: `app_id` он ставит только
//! когда исполняемый файл лежит не в `target\debug` и не в `target\release`.

#[cfg(target_os = "macos")]
mod imp {
    use std::panic::AssertUnwindSafe;
    use std::sync::atomic::{AtomicU64, Ordering};

    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2_foundation::{NSError, NSString};

    // Класс живёт в UserNotifications.framework. Ищем его в рантайме, но фреймворк
    // линкуем явно: без этого он может не оказаться загружен в процесс, и `AnyClass::get`
    // вернёт None на ровном месте.
    #[link(name = "UserNotifications", kind = "framework")]
    extern "C" {}

    /// UNAuthorizationOptionBadge | Sound | Alert — то же, что просит любое приложение
    /// с баннерами. Без этого запроса система молча выбрасывает наши уведомления.
    const AUTHORIZATION_OPTIONS: usize = 1 << 0 | 1 << 1 | 1 << 2;

    /// Хэндл приложения здесь ни при чём: показ идёт прямо в UNUserNotificationCenter.
    /// Функция есть только ради единого вызова из `main.rs`.
    pub fn remember_app(_app: &tauri::AppHandle) {}

    /// Каждому уведомлению нужен свой идентификатор, иначе новое заменяет предыдущее.
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Центр уведомлений процесса. None — фреймворка нет либо мы не внутри живого .app.
    fn center() -> Option<Retained<AnyObject>> {
        let class = AnyClass::get(c"UNUserNotificationCenter")?;
        match objc2::exception::catch(|| unsafe {
            let center: *mut AnyObject = msg_send![class, currentNotificationCenter];
            (!center.is_null()).then(|| Retained::retain(center)).flatten()
        }) {
            Ok(center) => center,
            Err(_) => {
                eprintln!("UNUserNotificationCenter бросил исключение, уведомлений не будет");
                None
            }
        }
    }

    /// Спросить разрешение на баннеры. Система показывает запрос один раз за установку,
    /// дальше просто отвечает сохранённым решением, поэтому зовём при каждом старте.
    ///
    /// Звать после старта цикла событий — из `RunEvent::Ready`, а не из `setup`: так
    /// положено по модели AppKit, и синглтон `currentNotificationCenter` гарантированно
    /// создаётся на главном потоке раньше, чем до него доберётся опрос трея. Сам по себе
    /// вызов из `setup` отказом не был (проверено 03.09.2026: с переносом в `Ready` ответ
    /// на сожжённом идентификаторе не изменился) — см. про статусы ниже.
    pub fn request_authorization() {
        let Some(center) = center() else {
            return;
        };

        // Сначала спрашиваем сохранённый статус и только потом — разрешение.
        // Без этого «уже отказано» и «система не дала спросить» выглядят одинаково:
        // `requestAuthorization` в обоих случаях отвечает «Notifications are not allowed
        // for this application», и на этом сообщении легко потерять полдня.
        let status_handler = RcBlock::new(|settings: *mut AnyObject| {
            if settings.is_null() {
                return;
            }
            let status: isize = unsafe { msg_send![settings, authorizationStatus] };
            match status {
                // notDetermined — единственный статус, при котором система покажет запрос.
                0 => {}
                1 => eprintln!(
                    "уведомления запрещены для этого приложения. Запрос система больше \
                     не покажет: он выдаётся один раз на идентификатор бандла, и если \
                     приложение закрыли, не ответив, засчитывается отказ. \
                     Включается в «Системные настройки → Уведомления → Копирка»"
                ),
                2 => eprintln!("уведомления разрешены"),
                other => eprintln!("статус разрешения на уведомления: {other}"),
            }
        });
        let status_result = objc2::exception::catch(AssertUnwindSafe(|| unsafe {
            let _: () = msg_send![
                &*center,
                getNotificationSettingsWithCompletionHandler: &*status_handler,
            ];
        }));
        if status_result.is_err() {
            eprintln!("не удалось прочитать статус разрешения на уведомления");
        }

        let handler = RcBlock::new(|granted: Bool, error: *mut NSError| {
            if !granted.as_bool() {
                eprintln!("разрешение на уведомления не выдано");
            }
            if !error.is_null() {
                let message = unsafe { (*error).localizedDescription() };
                eprintln!("запрос разрешения на уведомления не удался: {message}");
            }
        });
        // AssertUnwindSafe: блок и `Retained` не помечены UnwindSafe (внутри UnsafeCell),
        // а `catch` этого требует. Ловим не панику Rust, а исключение ObjC — состояние
        // после него мы не переиспользуем, ловить нечего.
        let result = objc2::exception::catch(AssertUnwindSafe(|| unsafe {
            let _: () = msg_send![
                &*center,
                requestAuthorizationWithOptions: AUTHORIZATION_OPTIONS,
                completionHandler: &*handler,
            ];
        }));
        if result.is_err() {
            eprintln!("запрос разрешения на уведомления бросил исключение");
        }
    }

    /// Показать баннер. Тихо: звук не ставим — файл, приехавший мимо окна, не повод
    /// перебивать то, чем человек занят.
    ///
    /// Зовут из фоновых потоков — опроса трея (`events::poll`) и съёмки области
    /// (`capture::run`). Это допустимо: `addNotificationRequest:` потокобезопасен,
    /// а синглтон центра к этому моменту уже создан на главном потоке в `RunEvent::Ready`.
    pub fn show(title: &str, body: &str) {
        let Some(center) = center() else {
            return;
        };
        let Some(content_class) = AnyClass::get(c"UNMutableNotificationContent") else {
            return;
        };
        let Some(request_class) = AnyClass::get(c"UNNotificationRequest") else {
            return;
        };

        let identifier = format!(
            "kopirka-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let title = NSString::from_str(title);
        let body = NSString::from_str(body);
        let identifier = NSString::from_str(&identifier);

        let handler = RcBlock::new(|error: *mut NSError| {
            if !error.is_null() {
                let message = unsafe { (*error).localizedDescription() };
                eprintln!("уведомление не доставлено: {message}");
            }
        });

        let result = objc2::exception::catch(AssertUnwindSafe(|| unsafe {
            let content: Retained<AnyObject> = msg_send![content_class, new];
            let _: () = msg_send![&*content, setTitle: &*title];
            let _: () = msg_send![&*content, setBody: &*body];
            // Триггер nil — доставить немедленно.
            let trigger: *const AnyObject = std::ptr::null();
            let request: Retained<AnyObject> = msg_send![
                request_class,
                requestWithIdentifier: &*identifier,
                content: &*content,
                trigger: trigger,
            ];
            let _: () = msg_send![
                &*center,
                addNotificationRequest: &*request,
                withCompletionHandler: &*handler,
            ];
        }));
        if result.is_err() {
            eprintln!("показ уведомления бросил исключение");
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::sync::OnceLock;

    use tauri::AppHandle;
    use tauri_plugin_notification::NotificationExt;

    /// Хэндл приложения: плагину он нужен, а `show` зовут из фоновых потоков (опрос
    /// трея), куда его не передать параметром без переделки всех вызовов.
    static APP: OnceLock<AppHandle> = OnceLock::new();

    pub fn remember_app(app: &AppHandle) {
        let _ = APP.set(app.clone());
    }

    /// Спрашивать нечего: в Windows нет системного запроса на уведомления, и плагин
    /// всегда отвечает `Granted`. Оставлено вызываемым, чтобы `RunEvent::Ready`
    /// в `main.rs` не пришлось ветвить по системам.
    pub fn request_authorization() {}

    pub fn show(title: &str, body: &str) {
        let Some(app) = APP.get() else {
            crate::diag!("уведомление «{title}» не показано: приложение ещё не запомнено");
            return;
        };
        // Ошибку плагин почти всегда съедает сам: внутри `show()` он уходит в
        // `async_runtime::spawn` и роняет результат (tauri-plugin-notification 2.4.0,
        // desktop.rs:216). Сюда попадает только отказ на подготовке запроса.
        if let Err(error) = app.notification().builder().title(title).body(body).show() {
            crate::diag!("уведомление не показано: {error}");
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    pub fn remember_app(_app: &tauri::AppHandle) {}
    pub fn request_authorization() {}
    pub fn show(_title: &str, _body: &str) {}
}

pub use imp::{remember_app, request_authorization, show};

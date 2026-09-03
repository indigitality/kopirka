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
    pub fn request_authorization() {
        let Some(center) = center() else {
            return;
        };
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

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn request_authorization() {}
    pub fn show(_title: &str, _body: &str) {}
}

pub use imp::{request_authorization, show};

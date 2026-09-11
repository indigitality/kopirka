//! Локальный Node-сервер как дочерний процесс приложения.
//!
//! Сервер лежит в ресурсах бандла (`Contents/Resources/backend`) вместе со своим
//! бинарником Node. Приложение поднимает его при старте и обязано погасить при выходе:
//! осиротевший Node держал бы порт и следующий запуск уже не состоялся бы.

use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::http;

pub const DEFAULT_PORT: u16 = 43117;
/// FDB-10 — ⌥⌘C в нотации tauri-plugin-global-shortcut. Дубль
/// `DEFAULT_CAPTURE_SHORTCUT` из `shared/api.ts`: Rust не читает TS-контракт,
/// значение держим синхронно руками (как и `DEFAULT_PORT` выше).
#[cfg(target_os = "macos")]
pub const DEFAULT_CAPTURE_SHORTCUT: &str = "Alt+Super+C";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const HEALTH_INTERVAL: Duration = Duration::from_millis(200);

/// Каталог конфига сервера. `KOPIRKA_CONFIG_DIR` нужен для изолированных экземпляров.
///
/// Путь обязан совпадать с тем, что берёт Node-сервер: `~/Library/Application Support/Kopirka`
/// на macOS, `%APPDATA%\Kopirka` (Roaming) на Windows. Разойдутся — оболочка будет читать
/// порт из одного конфига, а сервер встанет по другому.
///
/// Развилка через `cfg!`, а не через `#[cfg]`: обе ветки — обычное чтение переменной
/// окружения, компилируются везде, и на macOS результат тот же, что и до Windows-версии.
/// `HOME` на Windows заводит себе Git Bash, поэтому смотреть на него там нельзя.
pub fn config_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("KOPIRKA_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    if cfg!(windows) {
        // %APPDATA% — это Roaming, в живом сеансе она задана всегда. Если нет (служба,
        // урезанное окружение) — собираем тот же путь от профиля, ровно как сервер
        // в `server/src/config.ts`, `supportDirFor`. Разойтись здесь нельзя: оболочка
        // читала бы порт из одного конфига, а сервер писал бы в другой.
        let roaming = match std::env::var("APPDATA") {
            Ok(appdata) if !appdata.is_empty() => PathBuf::from(appdata),
            _ => PathBuf::from(std::env::var("USERPROFILE").ok()?)
                .join("AppData")
                .join("Roaming"),
        };
        Some(roaming.join("Kopirka"))
    } else {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home).join("Library").join("Application Support").join("Kopirka"))
    }
}

/// Как назвать путь к файлу рядом с конфигом в тексте для человека. Настоящий путь берётся
/// из `config_dir`, но в аварийном окне уместнее привычная запись, а не разложенный `%APPDATA%`.
pub fn config_path_hint(file: &str) -> String {
    #[cfg(windows)]
    return format!("%APPDATA%\\Kopirka\\{file}");
    #[cfg(not(windows))]
    return format!("~/Library/Application Support/Kopirka/{file}");
}

fn config_file() -> Option<PathBuf> {
    Some(config_dir()?.join("config.json"))
}

/// Порт из конфига сервера: его можно сменить в настройках «Копирки», и оболочка
/// обязана стучаться туда же, куда встанет сервер.
fn configured_port() -> Option<u16> {
    let raw = std::fs::read(config_file()?).ok()?;
    let parsed: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    u16::try_from(parsed["serverPort"].as_u64()?).ok().filter(|port| *port > 0)
}

/// Вернуть в конфиг стандартный порт. Зовётся из аварийного окна, когда порт занят
/// посторонней программой. В ответе — человеческая причина отказа, паники не бывает.
pub fn reset_port() -> Result<(), String> {
    if std::env::var_os("KOPIRKA_PORT").is_some() {
        return Err(
            "порт задан переменной окружения KOPIRKA_PORT, правка конфига его не перебьёт"
                .to_string(),
        );
    }
    let path = config_file().ok_or_else(|| "не найдена папка конфига".to_string())?;
    if !path.is_file() {
        return Err(format!(
            "конфига {} нет, порт в нём не задан — «Копирка» и так берёт {DEFAULT_PORT}",
            path.display()
        ));
    }

    let raw = std::fs::read(&path)
        .map_err(|error| format!("{} не читается: {error}", path.display()))?;
    let mut parsed: serde_json::Value = serde_json::from_slice(&raw)
        .map_err(|error| format!("{} — не разбирается как JSON: {error}", path.display()))?;
    let fields = parsed
        .as_object_mut()
        .ok_or_else(|| format!("{} — не объект JSON", path.display()))?;
    fields.insert("serverPort".to_string(), serde_json::json!(DEFAULT_PORT));

    // Пишем через временный файл: оборванная запись не должна оставить огрызок конфига.
    let text = serde_json::to_string_pretty(&parsed).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, text)
        .map_err(|error| format!("{} не записывается: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("{} не переименовывается: {error}", temporary.display()))
}

/// FDB-10 — сочетание глобального хоткея из конфига. `None` — хоткей выключен.
///
/// Читается каждый раз заново, без кэша: поллер трея зовёт эту функцию и по ней
/// узнаёт, что человек поменял сочетание в настройках. Ходить за тем же значением
/// в `GET /api/settings` нельзя — тот эндпоинт считает размер библиотеки обходом
/// всей папки, а здесь запрос идёт каждые две секунды.
///
/// Поля нет вовсе (конфиг от прежней версии) — берём умолчание, ровно как сервер
/// в `server/src/config.ts`. Явный `null` — это «выключено» и так и остаётся.
#[cfg(target_os = "macos")]
pub fn configured_capture_shortcut() -> Option<String> {
    let default = || Some(DEFAULT_CAPTURE_SHORTCUT.to_string());
    let Some(path) = config_file() else { return default() };
    let Ok(raw) = std::fs::read(path) else { return default() };
    let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&raw) else { return default() };
    match parsed.get("captureShortcut") {
        None => default(),
        Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(value)) if !value.is_empty() => Some(value.clone()),
        // Мусор в поле не должен молча отнимать хоткей — ведём себя как с портом.
        Some(_) => default(),
    }
}

/// Порт читается один раз за запуск: сервер тоже берёт его при старте и на лету не меняет.
pub fn port() -> u16 {
    static PORT: OnceLock<u16> = OnceLock::new();
    *PORT.get_or_init(|| {
        std::env::var("KOPIRKA_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .or_else(configured_port)
            .unwrap_or(DEFAULT_PORT)
    })
}

pub enum StartError {
    /// Порт занят кем-то посторонним — SVC-06.
    PortBusy(u16),
    /// Payload на месте, но сервер не поднялся.
    Failed(String),
}

/// Живой дочерний процесс. `stdin` держим открытым намеренно — см. `shutdown`.
pub struct Backend {
    child: Child,
}

#[derive(Default)]
pub struct BackendState(pub Mutex<Option<Backend>>);

/// Каталог payload'а. В бандле это `Contents/Resources/backend`, в dev-режиме
/// ресурсы могут быть не скопированы — тогда берём их прямо из проекта.
fn backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = app.path().resolve("backend", BaseDirectory::Resource) {
        candidates.push(dir);
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("backend"));
    candidates
        .into_iter()
        .find(|dir| dir.join("server").join("src").join("index.js").is_file())
        .ok_or_else(|| "не найден payload сервера (resources/backend)".to_string())
}

/// Проверка, что на порту действительно «Копирка», а не чужой процесс.
/// Зовётся дважды: в ожидании собственного сервера и при разборе занятого порта.
pub fn health(port: u16) -> bool {
    match http::get_probe(port, "/api/health") {
        Ok(response) => response.status == 200 && response.body.starts_with(b"{\"ok\":true"),
        Err(_) => false,
    }
}

pub fn start(app: &AppHandle) -> Result<u16, StartError> {
    let port = port();
    if http::port_in_use(port) {
        return Err(StartError::PortBusy(port));
    }

    let dir = backend_dir(app).map_err(StartError::Failed)?;
    // Имя бинарника в payload'е: `node` в macOS-сборке, `node.exe` в Windows-сборке.
    // Кладёт его туда `scripts/bundle-server.mjs`, здесь только берём.
    let node = dir.join(if cfg!(windows) { "node.exe" } else { "node" });

    let mut command = Command::new(&node);
    command
        .arg("server/src/index.js")
        .current_dir(&dir)
        .env("KOPIRKA_PORT", port.to_string())
        // Сервер сам открывает браузер — в десктопной сборке это лишнее окно.
        .env("KOPIRKA_NO_OPEN", "1")
        .env("KOPIRKA_QUIET", "1")
        // Сигнал серверу: следить за stdin и выходить, когда родитель умрёт.
        .env("KOPIRKA_PARENT_STDIN", "1")
        .stdin(Stdio::piped());

    // Наследовать stdout/stderr есть смысл только там, где они куда-то ведут.
    // На Windows приложение собрано с `windows_subsystem = "windows"`: консоли у процесса
    // нет, наследовать нечего, и сервер писал бы в закрытые дескрипторы. Свой журнал
    // он всё равно ведёт сам — `kopirka.log` рядом с конфигом.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: иначе на каждый запуск «Копирки» мигало бы окно консоли Node.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW).stdout(Stdio::null()).stderr(Stdio::null());
    }
    #[cfg(not(windows))]
    command.stdout(Stdio::inherit()).stderr(Stdio::inherit());

    // Прокидываем тестовые переопределения, если они заданы у приложения.
    for key in ["KOPIRKA_LIBRARY_PATH", "KOPIRKA_CONFIG_DIR"] {
        if let Ok(value) = std::env::var(key) {
            command.env(key, value);
        }
    }

    let child = command.spawn().map_err(|error| {
        StartError::Failed(match error.kind() {
            ErrorKind::NotFound => format!("не найден бинарник Node: {}", node.display()),
            ErrorKind::PermissionDenied => {
                format!("нет прав на запуск Node: {}", node.display())
            }
            _ => error.to_string(),
        })
    })?;

    let mut backend = Backend { child };

    let deadline = Instant::now() + HEALTH_TIMEOUT;
    loop {
        if health(port) {
            break;
        }
        if let Ok(Some(status)) = backend.child.try_wait() {
            return Err(StartError::Failed(format!("сервер завершился сразу после запуска ({status})")));
        }
        if Instant::now() >= deadline {
            backend.kill();
            return Err(StartError::Failed("сервер не ответил за 30 секунд".to_string()));
        }
        std::thread::sleep(HEALTH_INTERVAL);
    }

    app.state::<BackendState>().0.lock().unwrap().replace(backend);
    Ok(port)
}

impl Backend {
    fn kill(&mut self) {
        // Закрытие stdin — основной путь: сервер сам корректно закроет базу.
        drop(self.child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => {}
                Err(_) => break,
            }
            if Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        // Не успел — добиваем.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Гасим сервер. Вызывается на выходе приложения; повторный вызов безопасен.
///
/// Если «Копирка» подключилась к чужому серверу (порт был занят живым экземпляром),
/// в состоянии пусто — чужой процесс мы не заводили и не гасим.
pub fn shutdown(app: &AppHandle) {
    let taken = app.state::<BackendState>().0.lock().unwrap().take();
    if let Some(mut backend) = taken {
        backend.kill();
    }
}

/// Развилка занятого порта из `main.rs` целиком держится на `health`: `true` — открываем
/// интерфейс на чужом сервере, `false` — аварийное окно. Проверяем обе стороны.
#[cfg(test)]
mod tests {
    use super::health;
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpListener};

    /// Сервер на одно соединение: отдаёт заготовленный ответ и закрывается.
    fn serve_once(response: &'static str) -> u16 {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0u8; 1024];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(response.as_bytes());
            }
        });
        port
    }

    #[test]
    fn health_recognises_kopirka() {
        let port = serve_once(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n\
             {\"ok\":true,\"version\":\"0.1.0\"}",
        );
        assert!(health(port));
    }

    #[test]
    fn health_rejects_foreign_program() {
        let port = serve_once(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n\
             <html>это не Копирка</html>",
        );
        assert!(!health(port));
    }

    #[test]
    fn health_rejects_silent_port() {
        // Порт занят, но на запрос никто не отвечает — соединение просто закрывается.
        let port = serve_once("");
        assert!(!health(port));
    }

    #[test]
    fn health_false_when_nobody_listens() {
        // Порт получен и тут же освобождён — на нём заведомо никого нет.
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(!health(port));
    }
}

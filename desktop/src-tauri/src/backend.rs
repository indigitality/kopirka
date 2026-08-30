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
const HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const HEALTH_INTERVAL: Duration = Duration::from_millis(200);

/// Каталог конфига сервера. `KOPIRKA_CONFIG_DIR` нужен для изолированных экземпляров.
fn config_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("KOPIRKA_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join("Library").join("Application Support").join("Kopirka"))
}

/// Порт из конфига сервера: его можно сменить в настройках «Копирки», и оболочка
/// обязана стучаться туда же, куда встанет сервер.
fn configured_port() -> Option<u16> {
    let raw = std::fs::read(config_dir()?.join("config.json")).ok()?;
    let parsed: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    u16::try_from(parsed["serverPort"].as_u64()?).ok().filter(|port| *port > 0)
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
fn health(port: u16) -> bool {
    match http::get(port, "/api/health") {
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
    let node = dir.join("node");

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
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

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
pub fn shutdown(app: &AppHandle) {
    let taken = app.state::<BackendState>().0.lock().unwrap().take();
    if let Some(mut backend) = taken {
        backend.kill();
    }
}

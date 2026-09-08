//! Минимальный HTTP-клиент под один-единственный адрес — 127.0.0.1.
//!
//! Тянуть reqwest ради трёх запросов к локальному серверу без TLS незачем.
//! Запрос всегда идёт с `Connection: close`, поэтому тело читается просто до EOF —
//! ни chunked, ни keep-alive разбирать не нужно.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_millis(500);
const IO_TIMEOUT: Duration = Duration::from_secs(30);
/// Ожидание ответа при разведке «кто занял порт». Короткое намеренно: молчаливая
/// чужая программа не должна держать запуск приложения полминуты.
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

fn address(port: u16) -> SocketAddr {
    SocketAddr::from((Ipv4Addr::LOCALHOST, port))
}

/// Кто-то уже слушает порт. Не обязательно «Копирка» — см. проверку в backend.rs.
pub fn port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(&address(port), CONNECT_TIMEOUT).is_ok()
}

fn request(port: u16, head: String, body: &[u8], timeout: Duration) -> Result<Response, String> {
    let mut stream =
        TcpStream::connect_timeout(&address(port), CONNECT_TIMEOUT).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    if !body.is_empty() {
        stream.write_all(body).map_err(|e| e.to_string())?;
    }
    stream.flush().map_err(|e| e.to_string())?;

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;

    let separator = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| "ответ без заголовков".to_string())?;
    let head_text = String::from_utf8_lossy(&raw[..separator]).to_string();
    let status = head_text
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "не разобран статус ответа".to_string())?;

    Ok(Response { status, body: raw[separator + 4..].to_vec() })
}

fn get_head(port: u16, path: &str) -> String {
    format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    )
}

pub fn get(port: u16, path: &str) -> Result<Response, String> {
    request(port, get_head(port, path), &[], IO_TIMEOUT)
}

/// GET с коротким ожиданием — для проверки, кто отвечает на занятом порту.
pub fn get_probe(port: u16, path: &str) -> Result<Response, String> {
    request(port, get_head(port, path), &[], PROBE_TIMEOUT)
}

/// Единственный POST оболочки — отправка снятой области (`capture.rs`), а её нет вне macOS.
#[cfg(target_os = "macos")]
pub fn post_json(port: u16, path: &str, body: &str) -> Result<Response, String> {
    let head = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    request(port, head, body.as_bytes(), IO_TIMEOUT)
}

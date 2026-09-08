//! Диагностика оболочки: одна строка — одно сообщение.
//!
//! На macOS ничего не меняется: `eprintln!` уходит в stderr, а его у бандла, запущенного
//! через LaunchServices, подбирает система — оттуда сообщения и попадают в консоль.
//!
//! На Windows этого пути нет. `main.rs` собран с `windows_subsystem = "windows"`, у процесса
//! нет ни консоли, ни осмысленного stderr, и любой `eprintln!` там пишет в закрытую трубу —
//! то есть в никуда. Поэтому те же строки дописываются в `<папка конфига>\kopirka-shell.log`,
//! рядом с `config.json` и `kopirka.log` сервера. Файл именно отдельный: `kopirka.log` ведёт
//! Node-сервер, и мешать в него записи оболочки значит потерять и то, и другое.

/// Сообщение диагностики оболочки. На macOS — ровно тот же `eprintln!`, что и был;
/// на Windows — строка в `kopirka-shell.log`.
#[macro_export]
macro_rules! diag {
    ($($arg:tt)*) => {{
        #[cfg(not(windows))]
        eprintln!($($arg)*);
        #[cfg(windows)]
        $crate::log::append(&format!($($arg)*));
    }};
}

/// Ротации нет — есть предел. Дошли до него, начинаем файл заново: для разбора нужны
/// последние строки, а не история за всё время.
#[cfg(windows)]
const SIZE_LIMIT: u64 = 256 * 1024;

#[cfg(windows)]
const FILE_NAME: &str = "kopirka-shell.log";

/// Дописать строку в лог оболочки. Молча ничего не делает, если писать некуда:
/// диагностика не имеет права мешать работе приложения.
#[cfg(windows)]
pub fn append(message: &str) {
    use std::io::Write;

    let Some(dir) = crate::backend::config_dir() else {
        return;
    };
    // Папку обычно создаёт сервер, но оболочка пишет и тогда, когда он не поднялся.
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(FILE_NAME);

    let oversized = std::fs::metadata(&path).map(|meta| meta.len() > SIZE_LIMIT).unwrap_or(false);
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(!oversized)
        .truncate(oversized)
        .open(&path)
    else {
        return;
    };
    let _ = writeln!(file, "{} {message}", stamp());
}

/// Местное время в виде `2026-09-09 14:31:07`. Берём у системы, а не считаем сами:
/// `GetLocalTime` уже отдаёт разложенные поля, и переводить эпоху в календарь не нужно.
#[cfg(windows)]
fn stamp() -> String {
    #[repr(C)]
    #[derive(Default)]
    struct SystemTime {
        year: u16,
        month: u16,
        day_of_week: u16,
        day: u16,
        hour: u16,
        minute: u16,
        second: u16,
        milliseconds: u16,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetLocalTime(out: *mut SystemTime);
    }

    let mut now = SystemTime::default();
    unsafe { GetLocalTime(&mut now) };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        now.year, now.month, now.day, now.hour, now.minute, now.second
    )
}

//! Быстрая команда Finder «Добавить в Копирку» — ставится и обновляется приложением.
//!
//! Участникам клуба нельзя предлагать «запустите вот этот shell-скрипт»: половина
//! не запустит, вторая половина запустит не тот. Поэтому пункт контекстного меню
//! ставит само приложение при старте — из текстов, зашитых в бинарник.
//!
//! Тексты живут в `quick-action/` и только там: оттуда их берёт `include_str!`
//! и оттуда же копирует `quick-action/install.sh` для ручной установки. Две копии
//! одного скрипта уже однажды разъехались — у Сергея месяцами работал обработчик
//! от 30.08 с `osascript` на успех, и уведомления приходили с иконкой Script Editor.
//!
//! Пишем ровно три файла и только при отличии: раскладка сама по себе безобидна,
//! но `pbs -flush` на каждом запуске дёргать незачем.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Тексты обработчика и службы. Пути — от `desktop/src-tauri/src` к корню `app`.
const HANDLER: &str = include_str!("../../../quick-action/quick-add.sh");
const INFO_PLIST: &str = include_str!("../../../quick-action/workflow/Info.plist");
const DOCUMENT_WFLOW: &str = include_str!("../../../quick-action/workflow/document.wflow");

/// Имя службы видно пользователю в контекстном меню и в списке расширений Finder.
const SERVICE_NAME: &str = "Добавить в Копирку";

fn support_dir(home: &Path) -> PathBuf {
    home.join("Library").join("Application Support").join("Kopirka")
}

fn service_dir(home: &Path) -> PathBuf {
    home.join("Library").join("Services").join(format!("{SERVICE_NAME}.workflow")).join("Contents")
}

/// Записать файл, если его содержимое отличается. `true` — файл действительно менялся.
fn write_if_changed(path: &Path, contents: &str) -> io::Result<bool> {
    if fs::read_to_string(path).is_ok_and(|existing| existing == contents) {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)?;
    Ok(true)
}

/// Сделать файл исполняемым. Отдельно от записи: права могли слететь и без правки текста.
#[cfg(unix)]
fn make_executable(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)?.permissions();
    if permissions.mode() & 0o111 != 0o111 {
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)?;
    }
    Ok(())
}

/// Разложить быструю команду в заданном «домашнем каталоге».
/// `true` — что-то поменялось, и системе нужно перечитать список служб.
///
/// Домашний каталог параметром, а не из `$HOME`: так функция проверяется тестом
/// на временной папке и не лезет в настоящую `~/Library`.
pub fn install(home: &Path) -> io::Result<bool> {
    let handler = support_dir(home).join("quick-add.sh");
    let mut changed = write_if_changed(&handler, HANDLER)?;
    #[cfg(unix)]
    make_executable(&handler)?;

    let contents = service_dir(home);
    changed |= write_if_changed(&contents.join("Info.plist"), INFO_PLIST)?;
    changed |= write_if_changed(&contents.join("document.wflow"), DOCUMENT_WFLOW)?;
    Ok(changed)
}

/// Поставить быструю команду в фоне при старте приложения.
///
/// В фоне — потому что это запись трёх файлов и запуск `pbs`, а окно должно
/// открыться немедленно. Любая ошибка остаётся в stderr (он же `kopirka.log`
/// в бандле): без пункта в меню приложение работает, а падать из-за него нельзя.
pub fn ensure_installed() {
    // Изолированный экземпляр (песочница, тесты, вторая библиотека) не должен
    // трогать пользовательские службы: обработчик один на систему и ходит на порт
    // из настоящего конфига, а мы бы перезаписали его своим.
    if std::env::var_os("KOPIRKA_CONFIG_DIR").is_some() {
        return;
    }
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        eprintln!("быстрая команда не поставлена: не задан HOME");
        return;
    };
    std::thread::spawn(move || match install(&home) {
        Ok(false) => {}
        Ok(true) => {
            // Без этого пункт появится только после перелогина.
            if let Err(error) =
                std::process::Command::new("/System/Library/CoreServices/pbs").arg("-flush").status()
            {
                eprintln!("не удалось обновить список служб (pbs -flush): {error}");
            }
        }
        Err(error) => eprintln!("быстрая команда не поставлена: {error}"),
    });
}

#[cfg(test)]
mod tests {
    use super::{install, DOCUMENT_WFLOW, HANDLER, INFO_PLIST};
    use std::fs;
    use std::path::PathBuf;

    /// Временный «дом» на время теста. Настоящую `~/Library` тесты не трогают.
    struct TempHome(PathBuf);

    impl TempHome {
        fn new(tag: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "kopirka-quickaction-{tag}-{}-{:?}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn handler(&self) -> PathBuf {
            self.0.join("Library/Application Support/Kopirka/quick-add.sh")
        }

        fn contents(&self) -> PathBuf {
            self.0.join("Library/Services/Добавить в Копирку.workflow/Contents")
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn first_run_creates_all_three_files() {
        let home = TempHome::new("create");
        assert!(install(&home.0).unwrap(), "первая установка не отчиталась об изменении");
        assert_eq!(fs::read_to_string(home.handler()).unwrap(), HANDLER);
        assert_eq!(
            fs::read_to_string(home.contents().join("Info.plist")).unwrap(),
            INFO_PLIST
        );
        assert_eq!(
            fs::read_to_string(home.contents().join("document.wflow")).unwrap(),
            DOCUMENT_WFLOW
        );
    }

    #[cfg(unix)]
    #[test]
    fn handler_is_executable() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempHome::new("chmod");
        install(&home.0).unwrap();
        let mode = fs::metadata(home.handler()).unwrap().permissions().mode();
        assert_eq!(mode & 0o111, 0o111, "обработчик не исполняемый: {mode:o}");
    }

    #[test]
    fn second_run_changes_nothing() {
        let home = TempHome::new("idempotent");
        install(&home.0).unwrap();
        let before = fs::metadata(home.handler()).unwrap().modified().unwrap();
        assert!(!install(&home.0).unwrap(), "повторная установка сочла файлы изменёнными");
        let after = fs::metadata(home.handler()).unwrap().modified().unwrap();
        assert_eq!(before, after, "обработчик переписан, хотя текст тот же");
    }

    #[test]
    fn stale_copy_is_replaced() {
        // Ровно случай Сергея: в системе лежит обработчик прошлой версии.
        let home = TempHome::new("stale");
        install(&home.0).unwrap();
        fs::write(home.handler(), "#!/bin/bash\n# версия от 30.08\n").unwrap();
        assert!(install(&home.0).unwrap(), "устаревший обработчик не переписан");
        assert_eq!(fs::read_to_string(home.handler()).unwrap(), HANDLER);
    }

    #[test]
    fn workflow_file_is_repaired() {
        let home = TempHome::new("wflow");
        install(&home.0).unwrap();
        fs::write(home.contents().join("document.wflow"), "<broken/>").unwrap();
        assert!(install(&home.0).unwrap(), "испорченный document.wflow не переписан");
        assert_eq!(
            fs::read_to_string(home.contents().join("document.wflow")).unwrap(),
            DOCUMENT_WFLOW
        );
    }

    /// Обработчик обязан говорить через приложение, а не через osascript: ради этого
    /// всё и затевалось. Проверяем текст, который реально попадёт пользователю.
    #[test]
    fn handler_notifies_through_the_app() {
        assert!(HANDLER.contains("/api/notify"), "обработчик не зовёт /api/notify");
        assert!(
            HANDLER.contains("Origin: $SERVER"),
            "запрос к /api/notify идёт без Origin — сервер такой отобьёт"
        );
        // osascript оставлен, но только как запасной путь — не на успех и не на дубли.
        assert!(!HANDLER.contains("added=$((added+1))"), "обработчик снова считает успехи сам");
        assert!(!HANDLER.contains("dupes"), "обработчик снова говорит про дубли сам");
    }
}

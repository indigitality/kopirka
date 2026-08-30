-- CAP-05 — Folder Action «Копирки».
--
-- Срабатывает, когда в отслеживаемой папке появляются файлы, и передаёт
-- управление шелл-скрипту. Вся логика — там: AppleScript здесь нужен только
-- потому, что macOS умеет вешать на папку именно его.
--
-- Скрипт намеренно НЕ передаёт список added_items: обработчик разбирает всю
-- папку целиком, чтобы забрать и то, что накопилось, пока сервер был выключен.

on adding folder items to this_folder after receiving added_items
	runImporter(this_folder)
end adding folder items to

-- Ручной запуск (двойной клик по скрипту) — удобно для проверки установки.
on run
	tell application "System Events"
		set attachedFolders to path of every folder action whose name contains "Копирка"
	end tell
	if (count of attachedFolders) is 0 then
		display notification "Скрипт не привязан ни к одной папке" with title "Копирка"
	else
		repeat with p in attachedFolders
			runImporter(p as alias)
		end repeat
	end if
end run

on runImporter(targetFolder)
	set folderPath to POSIX path of targetFolder
	set importer to (POSIX path of (path to library folder from user domain)) & "Application Support/Kopirka/kopirka-import.sh"

	try
		do shell script quoted form of importer & " " & quoted form of folderPath
	on error errText number errNum
		-- Молча: папка автоимпорта работает в фоне, всплывающие ошибки
		-- при каждом скриншоте раздражали бы сильнее, чем помогали.
		-- Диагностика — в ~/Library/Application Support/Kopirka/folder-action.log
		if errNum is -1743 then
			display notification "Нет разрешения на запуск. Проверьте Настройки → Конфиденциальность" with title "Копирка"
		end if
	end try
end runImporter

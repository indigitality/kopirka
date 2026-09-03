#!/bin/bash
# «Добавить в Копирку» — быстрая команда в контекстном меню Finder.
#
# Выделяешь картинки в Finder → правый клик → «Добавить в Копирку».
# Реализовано как Quick Action (Automator-совместимый .workflow), потому что
# так пункт появляется в меню без запуска приложения и без Automator у пользователя.
#
# Обычно запускать это руками не нужно: приложение ставит и обновляет быструю
# команду само при старте (desktop/src-tauri/src/quickaction.rs — те же файлы,
# зашитые через include_str!). Скрипт остаётся для установки без приложения:
# сервер из терминала, отладка, проверка нового текста обработчика.
#
# Использование: ./install.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="Добавить в Копирку"
DEST="$HOME/Library/Services/$NAME.workflow"
SUPPORT="$HOME/Library/Application Support/Kopirka"

echo "→ Обработчик"
mkdir -p "$SUPPORT"
cp "$HERE/quick-add.sh" "$SUPPORT/quick-add.sh"
chmod +x "$SUPPORT/quick-add.sh"
echo "  $SUPPORT/quick-add.sh"

echo "→ Быстрая команда"
rm -rf "$DEST"
mkdir -p "$DEST/Contents"
cp "$HERE/workflow/Info.plist" "$DEST/Contents/Info.plist"
cp "$HERE/workflow/document.wflow" "$DEST/Contents/document.wflow"
echo "  $DEST"

# Перечитать список служб, иначе пункт появится только после перелогина.
/System/Library/CoreServices/pbs -flush 2>/dev/null
echo
echo "Готово. Выделите картинки в Finder → правый клик → «Быстрые действия» → «$NAME»."
echo "Если пункта нет: Настройки → Основные → Объекты входа и расширения → Finder,"
echo "поставьте галочку у «$NAME»."

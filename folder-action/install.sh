#!/bin/bash
# Установка автоимпорта папки скриншотов (CAP-05).
#
# Использование:
#   ./install.sh ~/Desktop/Скриншоты
#
# Что делает:
#   1. кладёт обработчик в ~/Library/Application Support/Kopirka/
#   2. компилирует Folder Action в ~/Library/Scripts/Folder Action Scripts/
#   3. включает Folder Actions и привязывает скрипт к указанной папке
#
# Шаг 3 требует разрешения на управление System Events — macOS спросит один раз.
# Если откажете, привязку можно сделать руками: правый клик по папке →
# «Службы» → «Настройка операций папки».

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPPORT="$HOME/Library/Application Support/Kopirka"
FA_DIR="$HOME/Library/Scripts/Folder Action Scripts"
FA_NAME="Копирка — автоимпорт.scpt"

WATCH_DIR="${1:-}"
if [ -z "$WATCH_DIR" ]; then
  echo "Укажите папку для автоимпорта:"
  echo "  ./install.sh ~/Desktop/Скриншоты"
  exit 1
fi

# Раскрываем ~ и относительные пути в абсолютные.
WATCH_DIR="${WATCH_DIR/#\~/$HOME}"
if [ ! -d "$WATCH_DIR" ]; then
  echo "Папки не существует: $WATCH_DIR"
  printf "Создать её? [y/N] "
  read -r answer
  case "$answer" in
    [yYдД]*) mkdir -p "$WATCH_DIR" || exit 1 ;;
    *) exit 1 ;;
  esac
fi
WATCH_DIR="$(cd "$WATCH_DIR" && pwd)"

echo "→ Обработчик"
mkdir -p "$SUPPORT"
cp "$HERE/kopirka-import.sh" "$SUPPORT/kopirka-import.sh"
chmod +x "$SUPPORT/kopirka-import.sh"
echo "  $SUPPORT/kopirka-import.sh"

echo "→ Folder Action"
mkdir -p "$FA_DIR"
if ! osacompile -o "$FA_DIR/$FA_NAME" "$HERE/kopirka-folder-action.applescript"; then
  echo "  не удалось скомпилировать AppleScript"
  exit 1
fi
echo "  $FA_DIR/$FA_NAME"

echo "→ Привязка к папке"
echo "  $WATCH_DIR"
if osascript <<EOF 2>/dev/null
tell application "System Events"
    if not (folder actions enabled) then set folder actions enabled to true
    -- Снимаем прежнюю привязку к этой же папке, чтобы не удвоить обработку.
    repeat with fa in (every folder action whose path is "$WATCH_DIR")
        delete fa
    end repeat
    set fa to make new folder action at end of folder actions with properties {path:"$WATCH_DIR", name:"$WATCH_DIR"}
    make new script at end of scripts of fa with properties {name:"$FA_NAME"}
end tell
EOF
then
  echo "  привязано"
else
  echo "  ⚠ автоматически не вышло — скорее всего, не выдано разрешение на System Events."
  echo "    Сделайте руками: правый клик по папке → Службы → Настройка операций папки,"
  echo "    включите Folder Actions, добавьте папку и выберите «$FA_NAME»."
fi

echo
echo "Готово. Проверка:"
echo "  1. приложение «Копирка» должно быть запущено;"
echo "  2. положите картинку в $WATCH_DIR;"
echo "  3. через пару секунд она уедет в библиотеку, а исходник — в Корзину."
echo
echo "Лог: $SUPPORT/folder-action.log"

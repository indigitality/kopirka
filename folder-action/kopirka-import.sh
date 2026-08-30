#!/bin/bash
# CAP-05 — автоимпорт папки скриншотов в «Копирку».
#
# Вызывается Folder Action при появлении файлов в отслеживаемой папке,
# но обрабатывает ВСЮ папку целиком, а не только новые файлы. Так задумано:
# если сервер был недоступен, накопившееся уедет при следующем срабатывании.
# Очереди и повторов по таймеру нет — PRD §5.8.
#
# Папка автоимпорта — транзитная зона, не хранилище: после успешной отправки
# исходник уезжает в системную Корзину, двойного хранения не остаётся.

set -uo pipefail

CONFIG="$HOME/Library/Application Support/Kopirka/config.json"
DEFAULT_SERVER="http://127.0.0.1:43117"
LOG="$HOME/Library/Application Support/Kopirka/folder-action.log"
LOCK="/tmp/kopirka-folder-action.lock"

# Файл считается дописанным, если его не трогали столько секунд.
# Скриншот macOS пишется быстро, но при копировании больших файлов защищает.
SETTLE_SECONDS=2

log() {
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG"
}

# Один экземпляр за раз: Folder Action легко срабатывает несколько раз подряд,
# а мы обрабатываем всю папку — параллельные запуски слали бы дубли.
if ! mkdir "$LOCK" 2>/dev/null; then
  # Замок старше пяти минут считаем брошенным.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null
    mkdir "$LOCK" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

WATCH_DIR="${1:-}"
if [ -z "$WATCH_DIR" ] || [ ! -d "$WATCH_DIR" ]; then
  log "ошибка: папка не передана или не существует: '$WATCH_DIR'"
  exit 1
fi

# Адрес сервера — из конфига приложения. Конфиг лежит ВНЕ библиотеки,
# порт нужен раньше, чем открывается база.
SERVER="$DEFAULT_SERVER"
if [ -f "$CONFIG" ]; then
  PORT=$(/usr/bin/python3 -c "
import json, sys
try:
    print(json.load(open(sys.argv[1]))['serverPort'])
except Exception:
    pass
" "$CONFIG" 2>/dev/null)
  [ -n "${PORT:-}" ] && SERVER="http://127.0.0.1:${PORT}"
fi

# Сервер не запущен — выходим молча. Файлы остаются, уедут в следующий раз.
if ! curl -fsS --max-time 3 "$SERVER/api/health" >/dev/null 2>&1; then
  log "сервер недоступен ($SERVER), файлы оставлены в папке"
  exit 0
fi

# Перемещение в системную Корзину без обращения к Finder:
# так не требуется разрешение на автоматизацию Finder.
move_to_trash() {
  local src="$1"
  local base dest
  base="$(basename "$src")"
  dest="$HOME/.Trash/$base"
  if [ -e "$dest" ]; then
    dest="$HOME/.Trash/${base%.*}-$(date +%s)-$RANDOM.${base##*.}"
  fi
  mv -f "$src" "$dest" 2>/dev/null
}

added=0
skipped=0
failed=0
now=$(date +%s)

# -maxdepth 1: вложенные папки не обходим, транзитная зона плоская.
while IFS= read -r -d '' file; do
  # Служебные файлы macOS и частично скачанные — мимо.
  name="$(basename "$file")"
  case "$name" in
    .*|*.download|*.crdownload|*.part) continue ;;
  esac

  # Ждём, пока файл дописан.
  mtime=$(stat -f %m "$file" 2>/dev/null) || continue
  if [ $((now - mtime)) -lt "$SETTLE_SECONDS" ]; then
    continue
  fi

  response=$(curl -fsS --max-time 30 \
    -X POST "$SERVER/api/import/watch" \
    -F "file=@$file" \
    -F "sourceType=folder_watch" 2>/dev/null)
  status=$?

  if [ $status -ne 0 ]; then
    failed=$((failed + 1))
    log "не отправлен: $name (curl $status) — оставлен в папке"
    continue
  fi

  outcome=$(printf '%s' "$response" | /usr/bin/python3 -c "
import json, sys
try:
    print(json.load(sys.stdin)['items'][0]['outcome'])
except Exception:
    print('unknown')
" 2>/dev/null)

  case "$outcome" in
    added|added_similar)
      move_to_trash "$file" && added=$((added + 1))
      ;;
    duplicate)
      # Точный дубль уже в библиотеке — исходник тоже в Корзину,
      # иначе он будет приезжать снова при каждом срабатывании.
      move_to_trash "$file" && skipped=$((skipped + 1))
      ;;
    *)
      failed=$((failed + 1))
      log "отклонён сервером: $name (outcome=$outcome) — оставлен в папке"
      ;;
  esac
done < <(find "$WATCH_DIR" -maxdepth 1 -type f \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
  -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.svg' \) -print0 2>/dev/null)

if [ $((added + skipped + failed)) -gt 0 ]; then
  log "итог: добавлено $added, дубли $skipped, не отправлено $failed"
fi

# Уведомление только когда есть что сказать и что-то реально уехало.
if [ $added -gt 0 ]; then
  /usr/bin/osascript -e "display notification \"Добавлено: $added\" with title \"Копирка\"" 2>/dev/null
fi

exit 0

#!/bin/bash
# «Добавить в Копирку» — обработчик быстрой команды Finder.
#
# Получает пути выделенных файлов и отправляет их локальному серверу «Копирки».
# Этот файл — единственный источник текста обработчика: отсюда его кладёт install.sh
# при ручной установке и отсюда же его зашивает в себя приложение (include_str! в
# desktop/src-tauri/src/quickaction.rs), чтобы ставить быструю команду самому.
# Правится только здесь.
set -uo pipefail

CONFIG="$HOME/Library/Application Support/Kopirka/config.json"
PORT=43117
if [ -f "$CONFIG" ]; then
  configured=$(/usr/bin/python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1]))['serverPort'])
except Exception: pass
" "$CONFIG" 2>/dev/null)
  [ -n "${configured:-}" ] && PORT="$configured"
fi
SERVER="http://127.0.0.1:${PORT}"

# Сказать пользователю. Сначала просим приложение (POST /api/notify): оно покажет
# уведомление от своего имени, с логотипом «Копирки». osascript остаётся запасным
# путём — когда сервер не отвечает, сказать больше некому, и чужая иконка Script
# Editor лучше полного молчания.
notify() {
  payload=$(/usr/bin/python3 -c 'import json,sys; print(json.dumps({"body": sys.argv[1]}))' "$1" 2>/dev/null)
  if [ -n "${payload:-}" ] && curl -fsS --max-time 3 -X POST "$SERVER/api/notify" \
      -H "Content-Type: application/json" -H "Origin: $SERVER" \
      --data "$payload" >/dev/null 2>&1; then
    return 0
  fi
  /usr/bin/osascript -e "display notification \"$1\" with title \"Копирка\"" 2>/dev/null
}

# Приложение не запущено — поднимаем и ждём. Иначе быстрая команда была бы
# бесполезна ровно тогда, когда она нужнее всего.
if ! curl -fsS --max-time 2 "$SERVER/api/health" >/dev/null 2>&1; then
  open -a "Копирка" 2>/dev/null || { notify "Копирка не установлена"; exit 1; }
  for _ in $(seq 1 30); do
    curl -fsS --max-time 1 "$SERVER/api/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
if ! curl -fsS --max-time 2 "$SERVER/api/health" >/dev/null 2>&1; then
  notify "Копирка не отвечает"
  exit 1
fi

failed=0
for file in "$@"; do
  [ -f "$file" ] || continue
  curl -fsS --max-time 30 -X POST "$SERVER/api/import" \
    -F "file=@$file" -F "sourceType=drag_drop" >/dev/null 2>&1 || failed=$((failed+1))
done

# Про добавленные файлы и про дубли скрипт молчит: и то и другое сервер кладёт в
# ленту событий (GET /api/events), а показывает приложение — со своей иконкой.
# Здесь остаются только сообщения о том, что «Копирки» нет или она не отвечает,
# и о запросах, которые не дошли: об этом, кроме самого скрипта, сказать некому.
[ $failed -gt 0 ] && notify "Не удалось добавить: $failed"
exit 0

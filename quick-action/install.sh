#!/bin/bash
# «Добавить в Копирку» — быстрая команда в контекстном меню Finder.
#
# Выделяешь картинки в Finder → правый клик → «Добавить в Копирку».
# Реализовано как Quick Action (Automator-совместимый .workflow), потому что
# так пункт появляется в меню без запуска приложения и без Automator у пользователя.
#
# Использование: ./install.sh

set -uo pipefail

NAME="Добавить в Копирку"
DEST="$HOME/Library/Services/$NAME.workflow"
SUPPORT="$HOME/Library/Application Support/Kopirka"

echo "→ Обработчик"
mkdir -p "$SUPPORT"
cat > "$SUPPORT/quick-add.sh" <<'HANDLER'
#!/bin/bash
# Отправляет переданные файлы в «Копирку». Вызывается из Quick Action.
set -uo pipefail

CONFIG="$HOME/Library/Application Support/Kopirka/config.json"
SERVER="http://127.0.0.1:43117"
if [ -f "$CONFIG" ]; then
  PORT=$(/usr/bin/python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1]))['serverPort'])
except Exception: pass
" "$CONFIG" 2>/dev/null)
  [ -n "${PORT:-}" ] && SERVER="http://127.0.0.1:${PORT}"
fi

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"Копирка\"" 2>/dev/null; }

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

added=0; dupes=0; failed=0
for file in "$@"; do
  [ -f "$file" ] || continue
  response=$(curl -fsS --max-time 30 -X POST "$SERVER/api/import" \
    -F "file=@$file" -F "sourceType=drag_drop" 2>/dev/null) || { failed=$((failed+1)); continue; }
  outcome=$(printf '%s' "$response" | /usr/bin/python3 -c "
import json,sys
try: print(json.load(sys.stdin)['items'][0]['outcome'])
except Exception: print('unknown')
" 2>/dev/null)
  case "$outcome" in
    added|added_similar) added=$((added+1)) ;;
    duplicate) dupes=$((dupes+1)) ;;
    *) failed=$((failed+1)) ;;
  esac
done

msg="Добавлено: $added"
[ $dupes  -gt 0 ] && msg="$msg · дубли: $dupes"
[ $failed -gt 0 ] && msg="$msg · ошибки: $failed"
notify "$msg"
HANDLER
chmod +x "$SUPPORT/quick-add.sh"
echo "  $SUPPORT/quick-add.sh"

echo "→ Быстрая команда"
rm -rf "$DEST"
mkdir -p "$DEST/Contents"

cat > "$DEST/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict><key>default</key><string>$NAME</string></dict>
      <key>NSMessage</key><string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict><key>NSApplicationIdentifier</key><string>com.apple.finder</string></dict>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.image</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

# document.wflow — один шаг «Запустить shell-скрипт», аргументы как \$@.
cat > "$DEST/Contents/document.wflow" <<WFLOW
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key><string>521</string>
  <key>AMApplicationVersion</key><string>2.10</string>
  <key>AMDocumentVersion</key><string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Optional</key><true/>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>AMActionVersion</key><string>2.0.3</string>
        <key>AMProvides</key>
        <dict>
          <key>Container</key><string>List</string>
          <key>Types</key><array><string>com.apple.cocoa.string</string></array>
        </dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key><string>Запустить shell-скрипт</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string>"\$HOME/Library/Application Support/Kopirka/quick-add.sh" "\$@"</string>
          <key>CheckedForUserDefaultShell</key><true/>
          <key>inputMethod</key><integer>1</integer>
          <key>shell</key><string>/bin/bash</string>
          <key>source</key><string></string>
        </dict>
        <key>BundleIdentifier</key>
        <string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key><string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key><false/>
        <key>CanShowWhenRun</key><true/>
        <key>Category</key><array><string>AMCategoryUtilities</string></array>
        <key>Class Name</key><string>RunShellScriptAction</string>
        <key>InputUUID</key><string>A1B2C3D4-0001-0001-0001-000000000001</string>
        <key>Keywords</key><array><string>Shell</string></array>
        <key>OutputUUID</key><string>A1B2C3D4-0002-0002-0002-000000000002</string>
        <key>UUID</key><string>A1B2C3D4-0003-0003-0003-000000000003</string>
        <key>UnlocalizedApplications</key><array><string>Automator</string></array>
        <key>arguments</key>
        <dict>
          <key>0</key>
          <dict>
            <key>default value</key><integer>0</integer>
            <key>name</key><string>inputMethod</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>0</string>
          </dict>
          <key>1</key>
          <dict>
            <key>default value</key><false/>
            <key>name</key><string>CheckedForUserDefaultShell</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>1</string>
          </dict>
          <key>2</key>
          <dict>
            <key>default value</key><string></string>
            <key>name</key><string>source</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>2</string>
          </dict>
          <key>3</key>
          <dict>
            <key>default value</key><string></string>
            <key>name</key><string>COMMAND_STRING</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>3</string>
          </dict>
          <key>4</key>
          <dict>
            <key>default value</key><string>/bin/sh</string>
            <key>name</key><string>shell</string>
            <key>required</key><string>0</string>
            <key>type</key><string>0</string>
            <key>uuid</key><string>4</string>
          </dict>
        </dict>
        <key>isViewVisible</key><integer>1</integer>
        <key>location</key><string>309.000000:253.000000</string>
        <key>nibPath</key>
        <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key><integer>1</integer>
    </dict>
  </array>
  <key>connectors</key><dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject.image</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceApplicationBundleID</key><string>com.apple.finder</string>
    <key>serviceApplicationPath</key><string>/System/Library/CoreServices/Finder.app</string>
    <key>serviceProcessesInput</key><integer>0</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
WFLOW

echo "  $DEST"

# Перечитать список служб, иначе пункт появится только после перелогина.
/System/Library/CoreServices/pbs -flush 2>/dev/null
echo
echo "Готово. Выделите картинки в Finder → правый клик → «Быстрые действия» → «$NAME»."
echo "Если пункта нет: Настройки → Основные → Объекты входа и расширения → Finder,"
echo "поставьте галочку у «$NAME»."

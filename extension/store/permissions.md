# Обоснование разрешений — вкладка Privacy practices

Текст для полей «Single purpose description» и «Permission justification»
в Chrome Web Store Developer Dashboard. Разрешения — ровно те, что в
`manifest.json`; ничего лишнего `tools/verify.mjs` не пропустит
(проверяет список разрешений и порт в `host_permissions`).

Ревью Google читает поля на любом языке, но заявку обычно ведут
англоязычные модераторы — поэтому ниже RU (чтобы Сергей понимал, что
именно заявляется) и готовый EN-текст (чтобы просто скопировать в
форму).

---

## Single purpose (единственное назначение)

**RU:** Расширение сохраняет изображения и скриншоты со страниц браузера
в локальную библиотеку приложения «Копирка», установленного на том же
компьютере.

**EN:** The extension saves images and screenshots from web pages into
the local library of the Kopirka app installed on the same computer.

---

## `activeTab`

**RU:** Нужен, чтобы (1) снять скриншот открытой вкладки, когда
пользователь нажимает кнопку расширения — `chrome.tabs.captureVisibleTab`,
и (2) включить оверлей выделения области на этой же вкладке, когда
пользователь выбирает «Снять область». Доступ выдаётся только по прямому
действию пользователя (клик по иконке), никакого фонового или
постоянного доступа к вкладкам расширение не запрашивает и не использует.

**EN:** Used to (1) capture a screenshot of the current tab when the user
clicks the toolbar icon (`chrome.tabs.captureVisibleTab`), and (2) inject
the area-selection overlay into that same tab when the user picks
"Capture area". Access is granted only by the user's own click on the
extension icon — no background or persistent tab access is requested or
used.

## `scripting`

**RU:** Нужен, чтобы внедрить единственный content script
(`content/area-select.js` — оверлей выделения прямоугольной области) в
активную вкладку по требованию, через `chrome.scripting.executeScript`,
и только в момент, когда пользователь нажал «Снять область». Скрипт не
подключается автоматически при загрузке страниц и ни на одном сайте не
живёт постоянно.

**EN:** Used to inject the extension's single content script
(`content/area-select.js`, the area-selection overlay) into the active
tab on demand, via `chrome.scripting.executeScript`, only at the moment
the user clicks "Capture area". The script is never auto-injected on
page load and does not persist on any site.

## `contextMenus`

**RU:** Нужен для одного пункта контекстного меню — «Сохранить в
Копирку» — на правом клике по изображению. Это основной способ
сохранить картинку без открытия popup.

**EN:** Used for a single context-menu item — "Save to Kopirka" — shown
when right-clicking an image. This is the primary way to save a picture
without opening the popup.

## `storage`

**RU:** Используется для двух вещей: (1) `storage.sync` хранит адрес
локального сервера приложения (по умолчанию `http://127.0.0.1:43117`),
чтобы не вводить его заново при каждом действии; (2) `storage.session`
временно держит уже снятый, но ещё не сохранённый кадр между закрытием
popup (во время выделения области на странице) и его повторным
открытием — на диск ничего не пишется, запись стирается после
сохранения или сама, максимум через 10 минут.

**EN:** Used for two things: (1) `storage.sync` remembers the local
server address (default `http://127.0.0.1:43117`) so the user doesn't
re-enter it every time; (2) `storage.session` temporarily holds a
capture that was taken but not yet saved, bridging the popup being
closed (during on-page area selection) and reopened — nothing is
written to disk, and the entry is cleared after saving or automatically
after at most 10 minutes.

## `notifications`

**RU:** Показывает системные уведомления только тогда, когда
пользователю больше неоткуда об этом узнать: сохранение через
контекстное меню не удалось (нет адреса у картинки, картинка формата
`blob:`, недоступен сервер, приложение отклонило файл), и «Кадр снят»,
если popup не открылся сам после выделения области. Уведомление об
**успешном** сохранении или о дубликате расширение не показывает —
его показывает само приложение «Копирка» (у него есть системное
уведомление по ленте событий локального сервера); дублировать его не
нужно.

**EN:** Shows a system notification only when there is no other way for
the user to find out: saving via the context menu failed (no image URL,
a `blob:` image, the server unreachable, the app rejected the file), and
"Capture ready" when the popup could not reopen automatically after an
area selection. It does **not** notify on a successful save or a
duplicate — the companion Kopirka app already shows its own system
notification for that (from the local server's event feed), so the
extension deliberately stays silent to avoid a duplicate notification.

## `host_permissions`: `http://127.0.0.1/*`, `http://localhost/*`

**RU:** Единственный сетевой адрес, с которым говорит расширение, — это
локальный HTTP-сервер приложения «Копирка», запущенный на том же
компьютере. Chrome не позволяет указать порт в шаблоне разрешения
(шаблон описывает хост, но не порт), поэтому разрешён весь петлевой
адрес целиком — это по-прежнему только сам компьютер пользователя,
ничего во внешней сети. `<all_urls>` не запрашивается: доступ к
содержимому обычной веб-страницы даёт `activeTab` в момент клика, а не
`host_permissions`.

**EN:** The only network destination the extension ever talks to is the
Kopirka app's own local HTTP server, running on the same machine. Chrome
match patterns cannot express a port (a pattern matches a host, not a
port), so the whole loopback host is granted — this still only ever
reaches the user's own computer, never the public internet. `<all_urls>`
is not requested: access to a regular page's content comes from
`activeTab`, granted only at the moment of a user click.

# Политика конфиденциальности — расширение «Копирка»

Черновик готов к публикации как есть, текстом. Нужно только выбрать
публичный адрес (страница на сайте клуба, отдельная статичная страница,
Notion-страница с публичным доступом — решает Сергей) и подставить его
в поле «Privacy policy URL» в Chrome Web Store Developer Dashboard —
без него магазин не примет расширение с `host_permissions`.
[уточнить у Сергея]: сам адрес и контакт для вопросов (раздел «Связь» в
конце обеих версий).

Дата в шапке — дата подготовки черновика; при публикации замени на
дату размещения по адресу.

---

## RU

**Политика конфиденциальности расширения «Копирка» для Chrome**
Черновик от 03.09.2026.

Расширение «Копирка» — компаньон одноимённого приложения для Mac
и Windows, локальной библиотеки визуальных референсов. Эта страница описывает
только расширение для Chrome; политика самого приложения «Копирка» —
отдельный документ.

### Коротко

Расширение не собирает и не передаёт данные никуда, кроме приложения
«Копирка», запущенного на этом же компьютере. Аналитики, рекламы,
трекеров, аккаунтов и облачных серверов у расширения нет.

### Что расширение обрабатывает и куда это уходит

Когда пользователь сохраняет картинку правым кликом или снимает
скриншот кнопкой расширения, оно отправляет:

- саму картинку (байты изображения);
- адрес страницы, с которой она взята;
- техническую подпись (размеры кадра, предполагаемое имя файла, способ
  съёмки — правый клик / видимая область / выделенная область).

Всё это уходит **только** на локальный HTTP-сервер приложения
«Копирка», работающий на том же компьютере пользователя (по умолчанию
`http://127.0.0.1:43117`), и только в момент явного действия
пользователя — правого клика «Сохранить в Копирку» или нажатия кнопки
«Сохранить» в превью. Расширению по устройству Chrome-разрешений
(`host_permissions`) запрещено обращаться к любому другому адресу,
кроме `127.0.0.1` и `localhost`, — оно физически не может отправить
что-либо в интернет.

Без запущенного приложения «Копирка» расширение не работает: показывает
«Копирка не запущена» и ничего никуда не отправляет.

### Что расширение хранит и где

- **Адрес сервера приложения** (например, `http://127.0.0.1:43117`) —
  в `chrome.storage.sync`. Это URL из стандартного набора адресов
  расширения, а не персональные данные; хранится, пока пользователь его
  не изменит или не удалит расширение.
- **Кадр, снятый, но ещё не сохранённый** (при выделении произвольной
  области страницы popup закрывается, и кадр нужно на несколько секунд
  куда-то деть) — в `chrome.storage.session`. На диск не пишется,
  стирается автоматически после сохранения и в любом случае не
  переживает 10 минут или перезапуск браузера.

Больше расширение не хранит ничего — ни истории сохранённых картинок,
ни списка посещённых страниц, ни идентификаторов пользователя.

### Кто ещё видит эти данные

Никто. Расширение не использует сторонние сервисы, SDK, аналитику или
рекламные сети. Единственный получатель данных — локальный сервер
приложения «Копирка» на компьютере самого пользователя; дальнейшая
судьба сохранённых файлов (где на диске они лежат, синхронизируются ли
куда-то) определяется настройками самого приложения «Копирка», а не
этого расширения.

### Дети

Расширение не адресовано детям и намеренно не собирает данные ни у
кого, включая детей.

### Изменения политики

Если состав обрабатываемых данных изменится, эта страница будет
обновлена, а дата в шапке — сдвинута.

### Связь

Вопросы по этой политике — [уточнить у Сергея: адрес/почта].

---

## EN

**Privacy Policy — Kopirka Chrome Extension**
Draft dated 2026-09-03.

Kopirka is a companion extension for the Kopirka app for Mac and
Windows, a local library of visual references. This page covers the Chrome extension
only; the Kopirka app itself has its own, separate policy.

### In short

The extension does not collect or transmit data anywhere except the
Kopirka app running on the same computer. There is no analytics, no
advertising, no tracking, no accounts, and no cloud server.

### What the extension processes, and where it goes

When a user saves a picture via right-click or captures a screenshot
with the extension's toolbar button, it sends:

- the image itself (the image bytes);
- the URL of the page the image came from;
- a small technical footer (frame dimensions, a suggested filename, and
  how it was captured — right-click, visible area, or a selected area).

This goes **only** to the local HTTP server of the Kopirka app running
on the user's own computer (`http://127.0.0.1:43117` by default), and
only at the moment of an explicit user action — the "Save to Kopirka"
right-click item, or the "Save" button in the capture preview. Chrome's
own permission system (`host_permissions`) restricts the extension to
`127.0.0.1` and `localhost` only — it is not technically able to send
anything to the public internet.

Without the Kopirka app running, the extension does not work: it shows
"Kopirka isn't running" and sends nothing anywhere.

### What the extension stores, and where

- **The app's server address** (e.g. `http://127.0.0.1:43117`) — in
  `chrome.storage.sync`. This is a URL from the extension's own
  settings, not personal data; it stays until the user changes it or
  removes the extension.
- **A capture that was taken but not yet saved** (closing the popup
  during on-page area selection means the capture needs somewhere to
  live for a few seconds) — in `chrome.storage.session`. Nothing is
  written to disk; it is cleared automatically after saving, and in any
  case does not survive 10 minutes or a browser restart.

Nothing else is stored — no history of saved images, no browsing
history, no user identifiers.

### Who else sees this data

No one. The extension uses no third-party services, SDKs, analytics, or
ad networks. The only recipient of any data is the local Kopirka server
on the user's own computer; what happens to saved files afterwards
(where they live on disk, whether they sync anywhere) is governed by
the Kopirka app's own settings, not by this extension.

### Children

The extension is not directed at children and does not knowingly
collect data from anyone, children included.

### Changes to this policy

If what the extension processes ever changes, this page will be updated
and the date at the top moved forward.

### Contact

Questions about this policy — [to be provided by Sergey: address/email].

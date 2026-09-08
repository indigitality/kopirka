# Листинг Chrome Web Store — «Копирка»

Черновик для карточки расширения в Chrome Web Store Developer Dashboard
(chrome.google.com/webstore/devconsole). Публикация ещё не выполнялась,
цифры вроде числа установок или отзывов сюда не относятся.

Всё, что помечено «[уточнить у Сергея]», — не выдумано, а честно не
известно из кода и документов проекта; без этого поле в дашборде не
заполнить.

---

## Название

**Копирка**

Совпадает с `manifest.json → name`. Отдельного «маркетингового» названия
для магазина не придумывалось — расширение всегда называлось так же, как
приложение, которому оно подчинено.

## Категория

Основная — **Продуктивность → Инструменты** (Productivity → Tools).

Осенью 2024 Google перекроил категории Chrome Web Store: вместо плоского
списка из 11 пунктов — три группы верхнего уровня (**Productivity**,
**Lifestyle**, **Make Chrome Yours**), внутри которых лежат подкатегории
вроде **Tools**, **Workflow & Planning**, **Developer Tools**. «Копирка» —
однократное действие (сохранить картинку/кадр), а не инструмент
организации рабочего процесса, поэтому вижу её в Tools внутри группы
Productivity, а не в Workflow & Planning.

[уточнить у Сергея] — точную формулировку пункта в выпадающем списке
дашборда не проверял вживую (нужен вход в аккаунт разработчика); при
подаче просто выбери ближайший пункт с названием Tools/Инструменты —
несовпадение категории не блокирует публикацию и правится потом без
ревью.

## Язык листинга

Основной — **русский**. Английский вариант ниже — задел на будущее,
если Сергей решит выходить на не-русскоязычную аудиторию; для первой
публикации можно подать только русский.

---

## Краткое описание (≤ 132 символа)

Строгий лимit Chrome Web Store. Посчитано программно (`[...str].length`
в Node, не `wc -m` — в этой оболочке `LC_CTYPE=C`, байты вместо
кодовых точек).

**RU** (129 символов):
> Сохраняйте картинки и скриншоты сайтов в «Копирку» на Mac и Windows — правым кликом или кнопкой расширения. Локально, без облака.

**EN** (130 символов):
> Save images and screenshots from webpages into the Kopirka app for Mac and Windows — right-click or the toolbar icon. Fully local.

## Подробное описание

**RU:**

> «Копирка» — расширение-компаньон для одноимённого приложения для Mac
> и Windows, локальной библиотеки визуальных референсов. Расширение снимает
> находки в браузере, приложение их хранит и организует.
>
> Три способа добавить картинку:
>
> · **Правый клик по картинке на странице** → «Сохранить в Копирку».
> Работает на любом обычном сайте.
>
> · **Скриншот видимой области вкладки** — кнопка на панели инструментов,
> один клик, предпросмотр перед сохранением.
>
> · **Скриншот произвольной области страницы** — та же кнопка → «Снять
> область»: страница затемняется, курсор становится перекрестием,
> протаскиваете прямоугольник — и получаете кадр именно этого места,
> с учётом ретина-экранов.
>
> **Нужно установленное приложение «Копирка» — для Mac или для Windows.**
> Расширение само ничего не хранит и не открывает: оно передаёт находку локально
> запущенному приложению по адресу на этом же компьютере
> (`127.0.0.1`, порт настраивается). Без запущенного приложения
> расширение честно покажет «Копирка не запущена» и не сделает вид,
> что всё получилось.
>
> **Всё остаётся на вашем компьютере.** Расширение не отправляет
> картинки, адреса страниц и вообще что бы то ни было на сторонние
> серверы — только на локальный сервер приложения. Никакой аналитики,
> никаких аккаунтов, никакого облака.
>
> Для кого: дизайнеры и все, кто собирает референсы и вдохновение из
> браузера и хочет одну локальную библиотеку вместо разбросанных папок
> «Загрузки» и вкладок «на подумать».

**EN:**

> Kopirka is a companion extension for the Kopirka app for Mac and
> Windows — a local library of visual references. The extension captures
> things you find in the browser; the app stores and organizes them.
>
> Three ways to save an image:
>
> · **Right-click any image on a page** → "Save to Kopirka". Works on
> any regular website.
>
> · **Screenshot the visible tab** — one click on the toolbar icon,
> with a preview before saving.
>
> · **Screenshot a custom area of the page** — same icon → "Capture
> area": the page dims, the cursor turns into a crosshair, drag a
> rectangle, and you get exactly that region, correctly on Retina
> displays too.
>
> **Requires the Kopirka app installed — for Mac or for Windows.**
> The extension doesn't store or open anything itself — it hands the capture to the
> app already running on the same computer (`127.0.0.1`, port
> configurable). Without the app running, the extension honestly shows
> "Kopirka isn't running" instead of pretending it worked.
>
> **Everything stays on your computer.** The extension never sends
> images, page addresses, or anything else to a third-party server —
> only to the app's own local server. No analytics, no accounts, no
> cloud.
>
> Built for designers and anyone who collects visual references and
> wants one local library instead of a scattered Downloads folder and
> a wall of "read later" tabs.

---

## Что ещё нужно в карточке дашборда (не текст, а поля формы)

- **Иконка магазина** 128×128 — есть, `icons/icon128.png` (см. `assets.md`).
- **Скриншоты** 1–5 штук — черновики из `app/extension/README.md` не
  подходят, нужны настоящие снимки popup, см. `assets.md`.
- **Адрес сайта поддержки / email** — [уточнить у Сергея]. Внутри
  расширения ссылка «Сообщить об ошибке» ведёт на `https://t.me/`
  (заглушка, `DESIGN-SPEC.md` §2 отмечает её как `unknown`) — для
  магазина нужен настоящий адрес или почта.
- **Адрес политики конфиденциальности** — обязательное поле, ссылка на
  публичную страницу. Текст — `privacy-policy.md`, но её ещё нужно
  куда-то опубликовать (сайт клуба, Notion-страница с публичным
  доступом — не мой выбор). [уточнить у Сергея]
- **Автор/издатель аккаунта разработчика** — тот, на чей Google-аккаунт
  оформлен доступ в Developer Dashboard ($5 разовый сбор). [уточнить у
  Сергея]

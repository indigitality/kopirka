#!/usr/bin/env node
/**
 * PDF-версия инструкции участнику: markdown → HTML → печать headless Chrome.
 *
 *   node docs/build-pdf.mjs docs/install-guide-windows.md
 *   node docs/build-pdf.mjs docs/install-guide.md "~/Desktop/Инструкция участнику.pdf"
 *
 * Зачем скрипт. PDF инструкции для macOS собирали 03.09.2026 и 04.09.2026 руками —
 * своим конвертером markdown → HTML и `Google Chrome --headless=new --print-to-pdf`.
 * Метод в логе описан, а кода не осталось, и второй раз то же оформление приходилось
 * восстанавливать по готовому файлу. Теперь вёрстка живёт здесь: инструкции для macOS
 * и для Windows печатаются одним скриптом и выглядят одинаково.
 *
 * Вёрстка сверена с розданным `Инструкция участнику.pdf` (сборка 04.09.2026):
 * A4, поля 20 мм сверху и снизу, 18 мм по бокам, системный шрифт, текст 12,5/19,
 * заголовки 22 / 16 / 13,5, `код` — Menlo 11 без подложки, у h2 линия снизу,
 * таблица с серой шапкой. Значения снимались из самого PDF (PyMuPDF), поэтому
 * менять их без причины не надо: обе инструкции раздаются вместе.
 *
 * Chrome берём системный — тот же приём, что в `tests/ui` и у скриншотов лендинга:
 * ничего не качаем. `puppeteer-core` тоже оттуда, из `tests/ui/node_modules`
 * (`tests/ui` — не workspace, зависимость там своя; если папка пуста, скрипт скажет,
 * что сделать).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

/** Системный Chrome. Другой путь можно передать через CHROME_PATH. */
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Где лежит `puppeteer-core`: у регрессионного прогона интерфейса, а не в корне. */
const PUPPETEER_HOST = path.join(APP, 'tests', 'ui', 'package.json');

// ───────────────────────────── markdown → HTML ─────────────────────────────
// Свой разбор, а не библиотека: в инструкциях используется ровно шесть конструкций,
// и тащить зависимость ради них незачем. Всё, что не перечислено ниже (картинки,
// блоки кода, вложенные списки), в инструкциях не встречается — если появится,
// сначала добавить сюда, а не надеяться, что «как-нибудь отрисуется».

/** Экранирование: в текст инструкций попадают `<`, `>` и `&` (например, `<ваше имя>`). */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Метка вырезанного `кода`: символ, которого в тексте инструкции быть не может. */
const MARK = '\u0000';

/**
 * Оформление внутри строки. Порядок важен: `код` разбирается первым и его содержимое
 * дальше не трогается — иначе `**` внутри пути превратился бы в жирный текст.
 */
function inline(raw) {
  const code = [];
  let text = raw.replace(/`([^`]+)`/g, (_, body) => {
    code.push(body);
    return `${MARK}${code.length - 1}${MARK}`;
  });

  text = escapeHtml(text);
  // Ссылка [текст](адрес) — печатаем и текст, и адрес: по бумаге не кликнешь.
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    href.startsWith('#') || href.startsWith('./') || href.startsWith('../')
      ? `<span class="link">${label}</span>`
      : `<span class="link">${label}</span> <span class="url">${href}</span>`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, index) =>
    `<code>${escapeHtml(code[Number(index)])}</code>`,
  );
  return text;
}

/** Строка таблицы `| a | b |` → массив ячеек. */
function cells(line) {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

const DIVIDER = /^\|[\s:|-]+\|$/;

function markdownToHtml(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let index = 0;

  /** Абзац или элемент списка продолжается, пока строки не кончились и не начался новый блок. */
  const isBreak = (line) =>
    line.trim() === '' ||
    /^#{1,6}\s/.test(line) ||
    /^[-*]\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    line.startsWith('|') ||
    line.trim() === '---';

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.trim() === '---') {
      out.push('<hr>');
      index += 1;
      continue;
    }

    // Таблица: шапка, строка-разделитель, дальше тело.
    if (line.startsWith('|') && DIVIDER.test(lines[index + 1] ?? '')) {
      const head = cells(line);
      index += 2;
      const body = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        body.push(cells(lines[index]));
        index += 1;
      }
      const th = head.map((cell) => `<th>${inline(cell)}</th>`).join('');
      const rows = body
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`);
      continue;
    }

    // Список. Продолжение элемента — строки с отступом до пустой строки или следующего пункта.
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (index < lines.length) {
        const item = ordered ? /^(\d+)\.\s+(.*)$/.exec(lines[index]) : /^[-*]\s+(.*)$/.exec(lines[index]);
        if (!item) break;
        const parts = [ordered ? item[2] : item[1]];
        index += 1;
        while (index < lines.length && !isBreak(lines[index])) {
          parts.push(lines[index].trim());
          index += 1;
        }
        items.push(parts.join(' '));
        // Пустая строка между пунктами списка его не разрывает.
        if (lines[index]?.trim() === '' && !isBreak(lines[index + 1] ?? '')) break;
        if (lines[index]?.trim() === '') index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const parts = [line.trim()];
    index += 1;
    while (index < lines.length && !isBreak(lines[index])) {
      parts.push(lines[index].trim());
      index += 1;
    }
    out.push(`<p>${inline(parts.join(' '))}</p>`);
  }

  return out.join('\n');
}

// ───────────────────────────── печатная вёрстка ─────────────────────────────
// Светлая: инструкцию читают с экрана и печатают на бумаге, тёмная тема приложения
// здесь ни при чём. Значения — из розданного PDF, см. шапку файла.

const STYLE = `
@page { size: A4; margin: 20mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  /* Helvetica Neue первой нарочно: системный шрифт (-apple-system → San Francisco)
     headless Chrome в PDF не вкладывает, а обводит контурами (Type 3), и файл
     распухает, а текст хуже ищется. В розданном PDF шрифт — HelveticaNeue. */
  font: 12.5px/1.52 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #1a1a1a;
  -webkit-font-smoothing: antialiased;
}
/* Межстрочный интервал один на весь документ — 1,52 (у текста это те же 19 на 12,5).
   Заголовки наследуют его же: в розданном PDF отступы над заголовками именно такие. */
h1, h2, h3, h4 { font-weight: 700; line-height: 1.52; }
h1 { font-size: 22px; margin: 0 0 15px; }
h2 {
  font-size: 16px; margin: 26px 0 0;
  padding-bottom: 5px; border-bottom: 1px solid #ddd;
}
h3 { font-size: 13.5px; margin: 17px 0 0; }
h4 { font-size: 12.5px; margin: 15px 0 0; }
p, ul, ol, table { margin: 10px 0 0; }
ul, ol { padding-left: 22px; }
li { margin: 6px 0 0; }
li:first-child { margin-top: 0; }
code { font: 11px/1 Menlo, 'SF Mono', Consolas, monospace; }
strong { font-weight: 700; }
.url { color: #555; }
hr { border: 0; border-top: 1px solid #ddd; margin: 24px 0 0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 7px 8px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-size: 12px; font-weight: 700; }
td { font-size: 12px; }

/* Печать: заголовок не должен оставаться один в конце страницы, а таблица и пункт
   списка — разрываться посередине. */
h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
h2, h3, h4 { break-inside: avoid; }
/* Строку и пункт списка рвать нельзя, а длинную таблицу — можно: иначе она целиком
   прыгает на следующую страницу и оставляет за собой пустую половину листа.
   Шапку thead Chrome при разрыве повторяет сам. */
li, tr { break-inside: avoid; page-break-inside: avoid; }
`;

function page(title, body) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

// ───────────────────────────────── печать ─────────────────────────────────

/** Путь с `~` в начале — от домашней папки. */
function expandHome(target) {
  if (target === '~') return process.env.HOME ?? target;
  if (target.startsWith('~/')) return path.join(process.env.HOME ?? '', target.slice(2));
  return target;
}

function loadPuppeteer() {
  try {
    return createRequire(PUPPETEER_HOST)('puppeteer-core');
  } catch {
    throw new Error(
      `не найден puppeteer-core. Он живёт в ${path.relative(APP, path.dirname(PUPPETEER_HOST))} — ` +
        'поставьте зависимости там: npm install --prefix tests/ui',
    );
  }
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    throw new Error('нужен путь к markdown-файлу: node docs/build-pdf.mjs docs/install-guide-windows.md');
  }

  const source = path.resolve(APP, expandHome(input));
  if (!fs.existsSync(source)) throw new Error(`нет файла ${source}`);
  const target = output
    ? path.resolve(APP, expandHome(output))
    : source.replace(/\.md$/, '.pdf');

  if (!fs.existsSync(CHROME)) {
    throw new Error(`не найден Chrome: ${CHROME}. Свой путь можно задать в CHROME_PATH`);
  }

  const markdown = fs.readFileSync(source, 'utf8');
  const title = /^#\s+(.*)$/m.exec(markdown)?.[1]?.trim() ?? path.basename(source, '.md');
  const html = page(title, markdownToHtml(markdown));

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  try {
    const tab = await browser.newPage();
    await tab.setContent(html, { waitUntil: 'load' });
    // preferCSSPageSize: размер и поля берутся из @page, а не из аргументов печати —
    // так же, как это делал `chrome --print-to-pdf`, которым собран первый PDF.
    await tab.pdf({ path: target, printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }

  const size = fs.statSync(target).size;
  process.stdout.write(`${target} — ${(size / 1024).toFixed(0)} КБ\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`\nPDF не собран: ${error.message}\n`);
  process.exit(1);
}

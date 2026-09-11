/**
 * JS-код, который вставляется в страницу внутри WKWebView одним шагом `js`
 * (см. wkprobe.swift) и живёт там до конца прогона под `window.__p`.
 *
 * У стенда нет настоящей мыши/клавиатуры — только `evaluateJavaScript`,
 * поэтому клики и клавиши тут синтетические: `clickAt` шлёт честную
 * последовательность pointer/mouse-событий в конкретную точку (это важно —
 * часть обработчиков Radix и `GridCard.tsx` реагируют на `pointerdown`, а не
 * только на `click`), `key` — `keydown`/`keyup` на активном элементе.
 *
 * `measure` — тот же структурный разбор containing block, что и
 * `checkContainingBlock` в `../lib/helpers.mjs` (Chrome-версия): обёртка
 * `[data-radix-popper-content-wrapper]`, её родитель и цепочка предков на
 * transform/filter/backdrop-filter/perspective/will-change/contain. Логика
 * специально продублирована, а не вынесена в общий модуль — она живёт внутри
 * строки с JS-исходником, которую parses WKWebView, а не как обычный ESM-код.
 */
export const HELPERS_SRC = `
  window.__p = {
    /*
      focus: false — клик БЕЗ программного фокуса. Так ведёт себя настоящий
      WebKit: по клику он не фокусирует <button> (давняя особенность движка), и
      обработчик keydown на самой кнопке после клика уже ничего не слышит.
      Обычный clickAt фокус ставит — иначе синтетическая клавиатура стенда
      (key) била бы в <body> во всех сценариях разом; но для рекордера хоткея
      это ровно тот случай, который надо воспроизвести (правка 11.09.2026).
    */
    clickAt: function (x, y, opts) {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var focus = !opts || opts.focus !== false;
      var base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
                   button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
      var down = Object.assign({}, base, { buttons: 1 });
      var up = Object.assign({}, base, { buttons: 0 });
      el.dispatchEvent(new PointerEvent('pointerover', down));
      el.dispatchEvent(new PointerEvent('pointermove', down));
      el.dispatchEvent(new MouseEvent('mousemove', down));
      el.dispatchEvent(new PointerEvent('pointerdown', down));
      el.dispatchEvent(new MouseEvent('mousedown', down));
      if (focus && el.focus) { try { el.focus(); } catch (e) {} }
      el.dispatchEvent(new PointerEvent('pointerup', up));
      el.dispatchEvent(new MouseEvent('mouseup', up));
      el.dispatchEvent(new MouseEvent('click', Object.assign({}, up, { detail: 1 })));
      return el.tagName + ' :: ' + (el.textContent || '').trim().slice(0, 30);
    },
    /*
      key('Escape') — как было: нажатие в активный элемент. Второй и третий
      аргументы добавлены под рекордер хоткея: mods — модификаторы
      ({ctrl, alt, shift, meta}), sel — куда именно диспатчить (по умолчанию
      активный элемент). sel: 'body' воспроизводит настоящее поведение WebKit:
      кнопка не сфокусирована, и нажатие уходит в <body>.
    */
    key: function (k, mods, sel) {
      var m = mods || {};
      var t = sel ? document.querySelector(sel) : null;
      if (!t) t = document.activeElement || document.body;
      var o = { key: m.key || k, code: k, bubbles: true, cancelable: true, composed: true, view: window,
                ctrlKey: !!m.ctrl, altKey: !!m.alt, shiftKey: !!m.shift, metaKey: !!m.meta };
      var down = new KeyboardEvent('keydown', o);
      t.dispatchEvent(down);
      t.dispatchEvent(new KeyboardEvent('keyup', o));
      return { target: t.tagName, defaultPrevented: down.defaultPrevented };
    },

    /** Куда попал фокус и что сейчас написано в поле-рекордере хоткея. */
    recorderState: function () {
      var field = document.querySelector('button[aria-label^="Сочетание"], button[aria-label="Нажмите сочетание"]');
      var active = document.activeElement;
      return {
        found: !!field,
        label: field ? field.getAttribute('aria-label') : null,
        text: field ? (field.textContent || '').trim() : null,
        focusIsRecorder: !!field && active === field,
        activeTag: active ? active.tagName.toLowerCase() : null,
        activeLabel: active ? active.getAttribute('aria-label') : null,
        error: (function () {
          var alert = document.querySelector('[data-shortcut-row] p[role="alert"]');
          return alert ? alert.textContent.trim() : null;
        })()
      };
    },
    clickText: function (sel, text) {
      var b = Array.prototype.slice.call(document.querySelectorAll(sel))
        .filter(function (x) { return x.textContent.trim() === text; })[0];
      if (!b) return false;
      var r = b.getBoundingClientRect();
      return window.__p.clickAt(r.left + r.width / 2, r.top + r.height / 2);
    },
    rectOf: function (sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    },
    layers: function () {
      return { listbox: !!document.querySelector('[role="listbox"]'), dialog: !!document.querySelector('[role="dialog"]') };
    },
    /**
     * Синтетический wheel, отправленный так, чтобы список ещё МОГ прокрутиться
     * в запрошенную сторону — иначе react-remove-scroll законно гасит
     * overscroll на границе, и это ловится как «баг», хотя это не он
     * (замечание по итогам первого прогона: реальное колесо докручивало список
     * до конца, и синтетическое событие после этого било в границу).
     */
    wheelOnFirstOption: function (deltaY) {
      var list = document.querySelector('[role="listbox"]');
      var item = document.querySelector('[role="listbox"] [role="option"]');
      if (!list || !item) return { error: 'нет списка или пункта' };
      var mid = Math.max(0, Math.round((list.scrollHeight - list.clientHeight) / 2));
      list.scrollTop = mid;
      var before = list.scrollTop;
      var ev = new WheelEvent('wheel', { deltaY: deltaY, bubbles: true, cancelable: true });
      item.dispatchEvent(ev);
      return { defaultPrevented: ev.defaultPrevented, scrollTopBefore: before, scrollTopAfter: list.scrollTop };
    },
    /* ── NEW-01 · NEW-03: область папок и перенос папки ───────────────────── */

    /* Строка папки по её имени: имя лежит в .sidebar-name, счётчик — отдельным узлом. */
    folderRow: function (name) {
      return Array.prototype.slice.call(document.querySelectorAll('[data-folder-row]')).filter(function (el) {
        var n = el.querySelector('.sidebar-name');
        return n && n.textContent.trim() === name;
      })[0] || null;
    },

    /** Снимок области папок: строки, прокрутка, ползунок, затухания. */
    folderArea: function () {
      var rect = function (el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
      };
      var box = document.querySelector('[data-drop-scroll]');
      var rows = Array.prototype.slice.call(document.querySelectorAll('[data-folder-row]'));
      var heights = {};
      rows.forEach(function (el) { heights[Math.round(el.getBoundingClientRect().height)] = 1; });
      return {
        rows: rows.length,
        rowHeights: Object.keys(heights).map(Number),
        area: rect(box),
        scrollTop: box ? box.scrollTop : null,
        scrollHeight: box ? box.scrollHeight : null,
        clientHeight: box ? box.clientHeight : null,
        thumb: rect(document.querySelector('.sidebar-thumb')),
        fadeTop: !!document.querySelector('.sidebar-fade[data-edge="top"][data-show]'),
        fadeBottom: !!document.querySelector('.sidebar-fade[data-edge="bottom"][data-show]')
      };
    },

    /** Прокрутить область папок и дать интерфейсу пересчитать затухания. */
    folderScroll: function (top) {
      var box = document.querySelector('[data-drop-scroll]');
      if (!box) return { error: 'нет области папок' };
      box.scrollTop = top < 0 ? box.scrollHeight : top;
      box.dispatchEvent(new Event('scroll', { bubbles: true }));
      return { scrollTop: box.scrollTop, max: box.scrollHeight - box.clientHeight };
    },

    /**
     * Синтетический перенос папки до точки внутри целевой строки: fraction
     * 0.5 — середина (вложить), 0.12 — верхняя четверть (вставка между
     * строками). Кнопку не отпускаем — снимок берётся прямо под грузом.
     * pointerdown шлём в саму строку (React-обработчик), pointermove — в
     * body: слушатели висят на window с capture.
     */
    folderDrag: function (fromName, toName, fraction) {
      var from = window.__p.folderRow(fromName);
      var to = window.__p.folderRow(toName);
      if (!from || !to) return { error: 'нет строки ' + (from ? toName : fromName) };
      var a = from.getBoundingClientRect();
      var b = to.getBoundingClientRect();
      var sx = a.left + a.width / 2, sy = a.top + a.height / 2;
      var tx = b.left + b.width / 2, ty = b.top + b.height * fraction;
      var opts = function (x, y, buttons) {
        return { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
                 button: 0, buttons: buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
      };
      from.dispatchEvent(new PointerEvent('pointerdown', opts(sx, sy, 1)));
      for (var i = 1; i <= 6; i += 1) {
        document.body.dispatchEvent(
          new PointerEvent('pointermove', opts(sx + ((tx - sx) * i) / 6, sy + ((ty - sy) * i) / 6, 1)),
        );
      }
      /*
        Снимок берём отдельным шагом (folderProbe): React коммитит призрак и
        индикатор уже после текущего оборота событий, и чтение DOM прямо здесь
        всегда заставало пустоту — на первом же прогоне стенда.
      */
      window.__p._row = { left: b.left, top: b.top, width: b.width, height: b.height, bottom: b.bottom };
      return { started: true, row: window.__p._row };
    },

    /** Что видно под грузом: призрак, тултип, индикатор вставки, зоны «В корень». */
    folderProbe: function () {
      var rect = function (el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
      };
      var ghost = document.querySelector('[data-folder-ghost]');
      /*
        Стекло призрака и тултипа: сам backdrop-filter и — главное — отсутствие
        предка, который его гасит. will-change/filter/opacity<1 над элементом
        образуют backdrop root, и размытию становится нечего размывать: тот же
        класс ошибки, что и containing block у поповеров.
      */
      var glassOf = function (el) {
        if (!el) return null;
        var cs = getComputedStyle(el);
        var killer = null;
        for (var node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
          var p = getComputedStyle(node);
          var reasons = [];
          if (/transform|filter|opacity|backdrop/.test(p.willChange || '')) reasons.push('will-change: ' + p.willChange);
          if (p.filter !== 'none') reasons.push('filter: ' + p.filter);
          if (parseFloat(p.opacity) < 1) reasons.push('opacity: ' + p.opacity);
          if (reasons.length > 0) { killer = { tag: node.tagName.toLowerCase(), reasons: reasons }; break; }
        }
        return {
          backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
          background: cs.backgroundColor,
          killer: killer
        };
      };
      var glassRow = ghost ? ghost.firstElementChild : null;
      var glassTip = ghost && ghost.children.length > 1 ? ghost.children[1] : null;
      return {
        row: window.__p._row || null,
        ghost: rect(ghost),
        tooltip: ghost ? ghost.textContent.trim() : null,
        glassRow: glassOf(glassRow),
        glassTip: glassOf(glassTip),
        tipColor: glassTip ? getComputedStyle(glassTip.firstElementChild).color : null,
        insert: rect(document.querySelector('[data-folder-insert]')),
        rootZones: document.querySelectorAll('[data-folder-root-zone]').length,
        area: rect(document.querySelector('[data-drop-scroll]'))
      };
    },

    /** Отпустить кнопку — перенос состоится по последней цели. */
    folderDrop: function () {
      document.body.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, clientX: 0, clientY: 0,
                                        button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window }),
      );
      return { ghost: !!document.querySelector('[data-folder-ghost]') };
    },

    /** Структурная проверка containing block — см. комментарий над HELPERS_SRC. */
    measure: function (triggerSel, layerSel) {
      var rect = function (el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
      };
      var trigger = triggerSel ? document.querySelector(triggerSel) : null;
      var layerEl = layerSel ? document.querySelector(layerSel) : null;
      var wrapper = layerEl ? layerEl.closest('[data-radix-popper-content-wrapper]') : null;
      var dialog = document.querySelector('[role="dialog"]');

      var offending = null;
      var parentIsBody = null;
      var parentTag = null;
      if (wrapper) {
        parentIsBody = wrapper.parentElement === document.body;
        parentTag = wrapper.parentElement ? wrapper.parentElement.tagName.toLowerCase() : null;
        for (var node = wrapper.parentElement; node; node = node.parentElement) {
          var cs = getComputedStyle(node);
          var backdrop = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
          var reasons = [];
          if (cs.transform !== 'none') reasons.push('transform: ' + cs.transform);
          if (cs.filter !== 'none') reasons.push('filter: ' + cs.filter);
          if (backdrop !== 'none') reasons.push('backdrop-filter: ' + backdrop);
          if (cs.perspective && cs.perspective !== 'none') reasons.push('perspective: ' + cs.perspective);
          if (/transform|filter/.test(cs.willChange || '')) reasons.push('will-change: ' + cs.willChange);
          if (/paint|layout|strict|content/.test(cs.contain || '')) reasons.push('contain: ' + cs.contain);
          if (reasons.length > 0) {
            offending = { tag: node.tagName.toLowerCase(), cls: (typeof node.className === 'string' ? node.className : '').slice(0, 120), reasons: reasons };
            break;
          }
        }
      }

      return {
        trigger: rect(trigger),
        layer: rect(layerEl),
        wrapper: rect(wrapper),
        dialog: rect(dialog),
        parentIsBody: parentIsBody,
        parentTag: parentTag,
        offending: offending
      };
    }
  };
  return 'ok';
`;

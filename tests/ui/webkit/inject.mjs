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
    clickAt: function (x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
                   button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
      var down = Object.assign({}, base, { buttons: 1 });
      var up = Object.assign({}, base, { buttons: 0 });
      el.dispatchEvent(new PointerEvent('pointerover', down));
      el.dispatchEvent(new PointerEvent('pointermove', down));
      el.dispatchEvent(new MouseEvent('mousemove', down));
      el.dispatchEvent(new PointerEvent('pointerdown', down));
      el.dispatchEvent(new MouseEvent('mousedown', down));
      if (el.focus) { try { el.focus(); } catch (e) {} }
      el.dispatchEvent(new PointerEvent('pointerup', up));
      el.dispatchEvent(new MouseEvent('mouseup', up));
      el.dispatchEvent(new MouseEvent('click', Object.assign({}, up, { detail: 1 })));
      return el.tagName + ' :: ' + (el.textContent || '').trim().slice(0, 30);
    },
    key: function (k) {
      var t = document.activeElement || document.body;
      var o = { key: k, code: k, bubbles: true, cancelable: true, composed: true, view: window };
      var down = new KeyboardEvent('keydown', o);
      t.dispatchEvent(down);
      t.dispatchEvent(new KeyboardEvent('keyup', o));
      return { target: t.tagName, defaultPrevented: down.defaultPrevented };
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

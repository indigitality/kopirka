/**
 * Сценарий 18: за весь прогон в консоли браузера не было ошибок уровня error
 * и необработанных исключений страницы. Слушатели console/pageerror вешаются
 * в run.mjs с момента создания страницы — здесь только подводим итог, поэтому
 * сценарий идёт последним и застаёт события от всех предыдущих сценариев.
 */
import assert from 'node:assert/strict';

export default async function consoleErrors(ctx) {
  const { consoleErrors } = ctx;

  if (consoleErrors.length > 0) {
    const list = consoleErrors.map((entry, i) => `  ${i + 1}. [${entry.kind}] ${entry.text}`).join('\n');
    assert.fail(`за прогон в консоли браузера появилось ${consoleErrors.length} ошибок:\n${list}`);
  }
}

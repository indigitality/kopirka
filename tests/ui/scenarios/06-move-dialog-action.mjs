/**
 * Сценарий 6: тот же диалог «Переместить в папку», но по делу — выбрать папку
 * стрелками/кликом и переместить. Открываем из среза «Не разобрано»: только
 * там перемещение в папку убирает карточку из текущего вида (LibraryProvider.
 * leftScopeAfterMove) — из «Всей библиотеки» файл никуда не делся бы, и
 * проверка «карточка ушла из текущего вида» ничего бы не поймала.
 *
 * Разбор красного прогона на старом коде (до коммита 54c6287): падал не сам
 * перенос, а первый же клик по «Не разобрано» — сетка оставалась на «Всей
 * библиотеке» с чужим файлом (из сценария 5) всё ещё выделенным. Причина —
 * не в этом сценарии: сценарий 5 на старом коде падает раньше по своему
 * потоку (на структурной проверке containing block, до собственных Esc/Esc)
 * и оставляет диалог/скрим открытым; `resetToLibraryRoot` слал два Esc и сразу
 * кликал по сайдбару, не убедившись, что скрим действительно ушёл из DOM —
 * клик попадал в него, а не в «Не разобрано». Починено в ../run.mjs
 * (resetToLibraryRoot ждёт исчезновения [role="dialog"] перед кликом), а не
 * здесь — этот сценарий лишь стал первой жертвой гонки и получил в придачу
 * более информативные сообщения об ошибке (см. describeState).
 */
import assert from 'node:assert/strict';
import {
  clickText,
  clickScope,
  findByText,
  waitFor,
  waitForCardCount,
  selectCard,
  cardIds,
  countMatching,
} from '../lib/helpers.mjs';

const MOVED_FILE = 'ember-scene-07';
const TARGET_FOLDER = 'Дашборды';

/**
 * Диагностика на случай таймаута: что реально сейчас в сетке и что говорит
 * API — вместо голого «не дождался», по которому непонятно, где искать
 * причину (пригодилось при разборе гонки между сценариями 5 и 6: сценарий 5,
 * упав раньше на структурной проверке, оставлял диалог открытым, и следующий
 * клик по сайдбару промахивался мимо ещё не убранного скрима — см.
 * resetToLibraryRoot в ../run.mjs).
 */
async function describeState(page, api) {
  const ids = await cardIds(page).catch(() => null);
  const dialogs = await countMatching(page, '[role="dialog"]').catch(() => null);
  const stats = await api('GET', '/api/stats').catch((error) => ({ error: error.message }));
  return `в сетке ${ids?.length ?? '?'} карточек (id: ${JSON.stringify(ids)}), открытых диалогов: ${dialogs}, /api/stats: ${JSON.stringify(stats)}`;
}

export default async function moveDialogAction(ctx) {
  const { page, api, seed } = ctx;
  await ctx.resetToLibraryRoot();

  await clickScope(page, 'Не разобрано');
  try {
    await waitForCardCount(page, seed.unfiledCount, { timeout: 6000, message: '«Не разобрано» не показало ожидаемое число файлов' });
  } catch (error) {
    throw new Error(`${error.message} — ${await describeState(page, api)}`);
  }

  const fileId = seed.filesByName.get(MOVED_FILE).id;
  await selectCard(page, fileId);
  await page.waitForSelector('[role="toolbar"][aria-label="Действия над выделенными файлами"]', { timeout: 4000 });
  await clickText(page, 'В папку');

  const trigger = await waitFor(() => findByText(page, 'Выберите папку'), { timeout: 3000 });
  await trigger.click();
  await trigger.dispose();
  await page.waitForSelector('[role="listbox"]', { timeout: 3000 });

  // Стрелка вниз действительно двигает фокус по пунктам списка (клавиатурная навигация Select).
  await page.keyboard.press('ArrowDown');
  const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  assert.equal(focusedRole, 'option', `после ArrowDown в фокусе элемент с role="${focusedRole}", ожидался "option"`);

  const target = await waitFor(() => findByText(page, TARGET_FOLDER, { selector: '[role="option"]' }), {
    timeout: 2000,
    message: `пункт «${TARGET_FOLDER}» не найден в списке папок`,
  });
  await target.click();
  await target.dispose();

  // Список закрывается пружиной (glassLayerMotion) и во время exit-анимации ещё
  // остаётся в DOM и кликабелен (opacity едет к 0, но pointer-events не сняты) —
  // если он визуально стоит поверх подвала диалога, следующий клик по
  // «Переместить» попадает в невидимый, но живой пункт списка под курсором, а не
  // в кнопку (поймано на практике через document.elementFromPoint). Дожидаемся,
  // пока список действительно уйдёт из DOM, а не только начнёт гаснуть.
  await waitFor(async () => (await countMatching(page, '[role="listbox"]')) === 0, {
    timeout: 2000,
    message: 'список папок не закрылся после выбора пункта',
  });

  await ctx.shot('06-move-dialog-folder-chosen');

  await clickText(page, 'Переместить');
  await waitFor(async () => (await page.$('[role="dialog"]')) === null, {
    timeout: 4000,
    message: 'диалог «Переместить в папку» не закрылся после «Переместить»',
  });

  try {
    await waitFor(
      async () => {
        const ids = await cardIds(page);
        return !ids.includes(fileId) ? ids : null;
      },
      { timeout: 4000, message: `карточка ${MOVED_FILE} (id ${fileId}) не пропала из «Не разобрано» после перемещения` },
    );
  } catch (error) {
    throw new Error(`${error.message} — ${await describeState(page, api)}`);
  }
  const remaining = await cardIds(page);
  assert.equal(remaining.length, seed.unfiledCount - 1, `в «Не разобрано» осталось ${remaining.length} карточек, ожидалось ${seed.unfiledCount - 1}`);

  const updated = await api('GET', `/api/files/${fileId}`);
  assert.equal(
    updated.folderId,
    seed.folderIds.get(TARGET_FOLDER),
    `сервер не подтвердил новую папку файла ${MOVED_FILE} (id ${fileId}): GET /api/files/${fileId} → folderId=${updated.folderId}, ожидалась папка «${TARGET_FOLDER}» (id ${seed.folderIds.get(TARGET_FOLDER)})`,
  );

  await ctx.shot('06-move-dialog-done');
}

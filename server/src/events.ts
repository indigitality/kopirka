/**
 * Лента событий — «что только что произошло» (GET /api/events).
 *
 * Живёт в памяти и только в памяти: между перезапусками не переживает, историю не
 * заменяет. Читатели два, и обоим нужна не история, а разница с прошлого раза:
 * десктопная оболочка (системное уведомление от имени приложения — раз в 2 с) и
 * окно (дорисовать карточку, не перезагружая страницу — раз в 3 с).
 *
 * В ленте два вида записей (`kind`): импорт файла и сообщение «со стороны»
 * (POST /api/notify). Второй вид нужен, чтобы скрипт вне приложения — быстрая
 * команда Finder, Folder Action — не звал `osascript` и не получал чужую иконку.
 *
 * Кольцо на 500 записей: при массовом импорте старое затирается, но клиент опрашивает
 * чаще, чем успевает набежать столько событий. Если всё же отстал — увидит `last`
 * и просто перечитает список целиком.
 */
import type { ImportEvent, LibraryEvent, NoticeEvent } from '../../shared/api.js';

/** Сколько последних событий держим. Дальше — вытеснение по кругу. */
const CAPACITY = 500;

/**
 * Событие без служебных полей — их проставляет сам журнал. Union расписан руками:
 * `Omit` по объединению схлопнул бы дискриминант `kind` и перестал различать виды.
 */
export type NewEvent =
  | Omit<ImportEvent, 'seq' | 'at'>
  | Omit<NoticeEvent, 'seq' | 'at'>;

export class EventLog {
  private readonly items: LibraryEvent[] = [];
  private seq = 0;

  /** Номер последнего события. 0 — с запуска ещё ничего не происходило. */
  get last(): number {
    return this.seq;
  }

  push(event: NewEvent): LibraryEvent {
    this.seq += 1;
    const stored = { ...event, seq: this.seq, at: new Date().toISOString() } as LibraryEvent;
    this.items.push(stored);
    if (this.items.length > CAPACITY) this.items.splice(0, this.items.length - CAPACITY);
    return stored;
  }

  /** События строго после `after`. Отстал больше, чем на кольцо — вернём что осталось. */
  since(after: number): LibraryEvent[] {
    if (this.items.length === 0) return [];
    return this.items.filter((item) => item.seq > after);
  }
}

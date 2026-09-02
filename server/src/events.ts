/**
 * Журнал успешных импортов — лента «что только что приехало» (GET /api/events).
 *
 * Живёт в памяти и только в памяти: между перезапусками не переживает, историю не
 * заменяет. Читатели два, и обоим нужна не история, а разница с прошлого раза:
 * десктопная оболочка (системное уведомление от имени приложения — раз в 2 с) и
 * окно (дорисовать карточку, не перезагружая страницу — раз в 3 с).
 *
 * Кольцо на 500 записей: при массовом импорте старое затирается, но клиент опрашивает
 * чаще, чем успевает набежать столько событий. Если всё же отстал — увидит `last`
 * и просто перечитает список целиком.
 */
import type { ImportEvent } from '../../shared/api.js';

/** Сколько последних событий держим. Дальше — вытеснение по кругу. */
const CAPACITY = 500;

export class EventLog {
  private readonly items: ImportEvent[] = [];
  private seq = 0;

  /** Номер последнего события. 0 — импортов с запуска ещё не было. */
  get last(): number {
    return this.seq;
  }

  push(event: Omit<ImportEvent, 'seq' | 'at'>): ImportEvent {
    this.seq += 1;
    const stored: ImportEvent = { ...event, seq: this.seq, at: new Date().toISOString() };
    this.items.push(stored);
    if (this.items.length > CAPACITY) this.items.splice(0, this.items.length - CAPACITY);
    return stored;
  }

  /** События строго после `after`. Отстал больше, чем на кольцо — вернём что осталось. */
  since(after: number): ImportEvent[] {
    if (this.items.length === 0) return [];
    return this.items.filter((item) => item.seq > after);
  }
}

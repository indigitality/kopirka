/**
 * Иконки «Копирки» — единое правило толщины.
 *
 * ── Правило ──────────────────────────────────────────────────────────────
 * Сетка 24, скруглённые концы, **оптическая толщина ровно 1,5 px при любом
 * размере**. В Paper это записано как stroke-width = 36 / размер: при 16 px
 * там стоит 2.25, при 14 — 2.6, при 12 — 3. В lucide то же самое даёт пара
 * `strokeWidth={1.5}` + `absoluteStrokeWidth`: компонент считает
 * `strokeWidth * 24 / size` (проверено по `node_modules/lucide-react/dist/esm/Icon.js`
 * версии 0.545.0), то есть 1.5 * 24 / 16 = 2.25 — ровно как в макете.
 *
 * ── Как писать ───────────────────────────────────────────────────────────
 * Основной способ — компонент `Icon`:
 *
 *     import { Folder } from 'lucide-react';
 *     import { Icon } from '@/lib/icons';
 *     <Icon icon={Folder} size={16} className="text-ink-muted" />
 *
 * Запасной — распыление пропов, когда элемент собирается вручную (например,
 * иконку передают пропом в `Button` или клонируют через `cloneElement`):
 *
 *     import { iconProps } from '@/lib/icons';
 *     <Folder {...iconProps(16)} />
 *
 * Оба пути дают одинаковый SVG. Голый `<Folder size={16} />` — нет: у него
 * толщина 2 px по умолчанию lucide, и он выпадает из системы.
 *
 * ── Размеры из макета ────────────────────────────────────────────────────
 *   16 — строка сайдбара, кнопка, поле поиска, подвал, панель деталей
 *   14 — «+» и «⋮» в строке, шеврон у селекта, галка в меню
 *   12 — галка в чекбоксе выбранной карточки
 *
 * ── Набор: имя на полке R13 → экспорт lucide-react 0.545.0 ────────────────
 *   library         → Library
 *   inbox           → Inbox
 *   trash-2         → Trash2
 *   folder          → Folder
 *   folder-open     → FolderOpen
 *   search          → Search
 *   x               → X
 *   sliders         → SlidersHorizontal      (на полке подпись «sliders», контур — горизонтальный)
 *   square          → Square
 *   grid-2x2        → Grid2x2
 *   grid-3x3        → Grid3x3
 *   msg-warning     → MessageSquareWarning   (ближайшее; контур в lucide 0.545 чуть новее макетного)
 *   settings        → Settings
 *   more-vertical   → EllipsisVertical       (имени `MoreVertical` в lucide больше нет)
 *   plus            → Plus
 *   chevron-down    → ChevronDown
 *   check           → Check
 *   tag             → Tag
 *   globe           → Globe
 *   external-link   → ExternalLink
 *   copy            → Copy
 *   image-plus      → ImagePlus
 *   triangle-alert  → TriangleAlert
 *   search-x        → SearchX
 *
 * Вне полки, но в макетах есть: `chevron-up` → ChevronUp (раскрытая папка в
 * сайдбаре, R13 · строки сайдбара).
 */
import type { LucideIcon, LucideProps } from 'lucide-react';

/** Оптическая толщина обводки, px. Не менять поштучно — это правило системы. */
export const ICON_STROKE = 1.5;

/** Размер иконки по умолчанию: строка сайдбара, кнопка, поле. */
export const ICON_SIZE = 16;

/**
 * Общие пропы иконки. `absoluteStrokeWidth` пересчитывает толщину под размер,
 * `round` у концов и стыков — то же, что в Paper (в lucide это и так значения
 * по умолчанию; здесь они записаны явно, чтобы правило читалось на месте).
 */
export const ICON_PROPS = {
  strokeWidth: ICON_STROKE,
  absoluteStrokeWidth: true,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const satisfies Partial<LucideProps>;

/** Пропы иконки заданного размера. Запасной путь — см. шапку файла. */
export function iconProps(size: number = ICON_SIZE) {
  return { ...ICON_PROPS, size };
}

export interface IconProps extends Omit<LucideProps, 'ref' | 'strokeWidth' | 'absoluteStrokeWidth'> {
  /** Компонент lucide: `<Icon icon={Folder} />`. */
  icon: LucideIcon;
  /** Сторона квадрата, px. По умолчанию 16. */
  size?: number;
}

/**
 * Иконка по правилу системы. Всё остальное (цвет, класс, aria) — как у lucide.
 */
export function Icon({ icon: Glyph, size = ICON_SIZE, ...rest }: IconProps) {
  return <Glyph {...ICON_PROPS} size={size} {...rest} />;
}

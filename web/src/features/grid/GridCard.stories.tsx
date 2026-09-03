/**
 * Витрина карточки сетки — по R13 «Карточка сетки и чипы» и экранам R01/R04/R06.
 *
 * Карточка позиционируется абсолютно (раскладку считает `useMasonry`), поэтому
 * каждая история кладёт её в холст фиксированного размера, изображающий панель
 * сетки: цвет `panel`, радиус `--radius-panel`, поле `--grid-pad`.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FileRecord } from '@shared/api';
import { GridCard } from './GridCard';

/** Превью — сплошной градиент data-URI: он не ходит в сеть и одинаков в CI. */
function gradient(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="300" fill="url(%23g)"/></svg>`;
  return `data:image/svg+xml;utf8,${svg.replaceAll('#', '%23')}`;
}

const FILE: FileRecord = {
  id: 1,
  sha256: 'a'.repeat(64),
  phash: null,
  similarToFileId: null,
  originalFilename: 'dashboard-dark.png',
  ext: 'png',
  sizeBytes: 1_842_000,
  width: 400,
  height: 300,
  folderId: 3,
  sourceType: 'drag_drop',
  sourceUrl: null,
  isBroken: false,
  hasPreview: true,
  addedAt: '2026-09-01T10:00:00.000Z',
  deletedAt: null,
  tags: ['Дашборд', 'графики', 'тёмная тема', 'аналитика', 'сетка'],
  previewUrl: gradient('#f4f6f3', '#d8ddd6'),
  originalUrl: '',
};

/** Средняя колонка канона: 1440 → панель 1168, поле 16, зазор 14, четыре колонки. */
const COLUMN_M = 274;
const CARD_H = 200;

const noop = () => {};
const handlers = {
  onSelectClick: noop,
  onToggle: noop,
  onOpen: noop,
  onDragStart: () => [] as readonly number[],
  onTrash: noop,
  onRestore: noop,
  onPurge: noop,
  onCopy: noop,
  onReveal: noop,
  onContextSelect: noop,
  onAddTag: noop,
  onMoveToFolder: noop,
};

function Canvas({
  width = COLUMN_M,
  height = CARD_H,
  children,
}: {
  width?: number;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-panel bg-panel"
      style={{ width: width + 32, height: height + 32, padding: 16 }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: 'Сетка/Карточка',
  component: GridCard,
  parameters: { layout: 'centered' },
  /* Базовые аргументы: каждая история собирает свой холст в `render`. */
  args: {
    ...handlers,
    file: FILE,
    box: { x: 16, y: 16, width: COLUMN_M, height: CARD_H },
    selected: false,
    scope: 'library',
    folderName: 'Интерфейсы',
  },
} satisfies Meta<typeof GridCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Покой: имя папки тёмным чипом сверху, теги светлыми — видны всегда.
 * Чип показывается везде, где файл лежит не в той папке, в которой стоит сетка:
 * во «Всей библиотеке», в поиске и в корзине — у любого файла с папкой, внутри
 * папки — только у карточек из её подпапок, в «Не разобрано» — никогда.
 */
export const Покой: Story = {
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={FILE}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected={false}
        scope="library"
        folderName="Интерфейсы"
      />
    </Canvas>
  ),
};

/**
 * Наведение. Чекбокс и `scale` живут на `:hover`, поэтому в Storybook история
 * снимается аддоном псевдосостояний: панель «Pseudo states» → hover.
 */
export const Наведение: Story = {
  parameters: { pseudo: { hover: true } },
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={FILE}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected={false}
        scope="library"
        folderName="Интерфейсы"
      />
    </Canvas>
  ),
};

/** Выбрана: кольцо 3 px лаймом и лаймовый круг с галкой вместо чипа папки. */
export const Выбрана: Story = {
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={FILE}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected
        scope="library"
        folderName="Интерфейсы"
      />
    </Canvas>
  ),
};

/** «Похоже дубль» — сплошной светлый чип отдельной строкой над тегами. */
export const Дубль: Story = {
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={{ ...FILE, similarToFileId: 42, tags: ['логотип', 'знак', 'айдентика', 'чёрное'] }}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected={false}
        scope="library"
        folderName="Айдентика"
      />
    </Canvas>
  ),
};

/** Корзина: карточка приглушена до 55 % (R04); чип папки, из которой файл удалён. */
export const Корзина: Story = {
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={FILE}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected={false}
        scope="trash"
        folderName="Интерфейсы"
      />
    </Canvas>
  ),
};

/** Битый файл — оформлен тем же языком чипов (в макете состояния нет). */
export const БитыйФайл: Story = {
  name: 'Битый файл',
  render: () => (
    <Canvas>
      <GridCard
        {...handlers}
        file={{ ...FILE, isBroken: true, previewUrl: null, tags: [] }}
        box={{ x: 16, y: 16, width: COLUMN_M, height: CARD_H }}
        selected={false}
        scope="library"
        folderName={null}
      />
    </Canvas>
  ),
};

/**
 * Три ширины подряд: узкая (S при 1440 — 178), средняя (274) и широкая (561).
 * Меняются только поле карточки и число чипов; геометрия самого чипа одна.
 */
export const ТриШирины: Story = {
  name: 'Три ширины',
  render: () => (
    <div className="flex items-start gap-4">
      {[178, COLUMN_M, 561].map((width) => (
        <Canvas key={width} width={width} height={CARD_H}>
          <GridCard
            {...handlers}
            file={{ ...FILE, similarToFileId: 42 }}
            box={{ x: 16, y: 16, width, height: CARD_H }}
            selected={false}
            scope="library"
            folderName="Интерфейсы"
          />
        </Canvas>
      ))}
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FileRecord, FolderRecord, TagRecord } from '@shared/api';
import { ToastProvider } from '@/components/ui/Toast';
import { LibraryContext, type LibraryValue } from '@/features/library/LibraryProvider';
import { DetailPanel } from './DetailPanel';

/* ── Фикстуры ─────────────────────────────────────────────────────────────── */

/** Ровный светлый прямоугольник вместо превью: сервера в витрине нет. */
const PREVIEW =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">' +
      '<rect width="160" height="100" fill="#e6e7e3"/></svg>',
  );

const folder = (id: number, name: string, children: FolderRecord[] = []): FolderRecord => ({
  id,
  name,
  parentFolderId: null,
  sortOrder: id,
  createdAt: '2026-08-01T10:00:00.000Z',
  fileCount: 12,
  totalFileCount: 24,
  children,
});

const folders: FolderRecord[] = [
  folder(1, 'Интерфейсы', [folder(2, 'Дашборды'), folder(3, 'Онбординг')]),
  folder(4, 'Айдентика'),
  folder(5, 'Типографика'),
];

const tags: TagRecord[] = [
  { id: 1, name: 'прайсинг', fileCount: 9 },
  { id: 2, name: 'карточки', fileCount: 16 },
  { id: 3, name: 'тёмная тема', fileCount: 18 },
  { id: 4, name: 'интерфейс', fileCount: 24 },
];

const file: FileRecord = {
  id: 101,
  sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f801',
  phash: '00000000000000ff',
  similarToFileId: null,
  originalFilename: 'pricing-cards-stripe.png',
  ext: 'png',
  sizeBytes: 1_887_436,
  width: 2560,
  height: 1600,
  folderId: 1,
  sourceType: 'context_menu',
  sourceUrl: 'https://stripe.com/pricing',
  isBroken: false,
  hasPreview: true,
  addedAt: '2026-09-02T14:38:00.000Z',
  deletedAt: null,
  tags: ['прайсинг', 'карточки', 'тёмная тема'],
  previewUrl: PREVIEW,
  originalUrl: PREVIEW,
};

const twin: FileRecord = { ...file, id: 102, phash: '00000000000000fd', similarToFileId: null };

/**
 * Блок «Похоже, это уже есть» дотягивает оригинал через `GET /api/files/:id`.
 * В витрине сервера нет — перехватываем именно этот запрос, остальные отдаём дальше.
 */
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith(`/api/files/${twin.id}`)) {
    return Promise.resolve(new Response(JSON.stringify(twin), { status: 200 }));
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof fetch;

const noop = () => {};
const resolved = () => Promise.resolve();

/** Минимальный контекст библиотеки: панели нужны папки, теги и путь на диске. */
const library = {
  files: [file, twin],
  total: 2,
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: null,
  loadMore: noop,
  reload: resolved,
  folders,
  folderNameById: new Map(folders.map((item) => [item.id, item.name])),
  stats: { library: 214, untagged: 8, trash: 12, similar: 1 },
  tags,
  libraryPath: '/Users/designer/Pictures/Копирка',
  applyFiles: noop,
  dropFiles: noop,
  moveToFolder: resolved,
  addTags: resolved,
  removeTags: resolved,
  setFileTags: resolved,
  trashFiles: resolved,
  restoreFiles: resolved,
  purgeFiles: resolved,
  emptyTrash: resolved,
  resolveSimilar: resolved,
  createFolder: () => Promise.resolve(folders[0] as FolderRecord),
  renameFolder: resolved,
  deleteFolder: resolved,
  moveFolder: resolved,
} satisfies LibraryValue;

/* ── Витрина ──────────────────────────────────────────────────────────────── */

/**
 * Правая панель детального просмотра — артборд R09. Проверяем три случая,
 * которые в живом приложении собираются только вместе с данными: обычный файл,
 * файл с пометкой «похоже, дубль» и файл в корзине.
 *
 * Панель растянута на высоту оверлея (852 при окне 900), чтобы подвал стоял
 * там же, где в макете.
 */
const meta = {
  title: 'Просмотр/Панель деталей',
  component: DetailPanel,
  decorators: [
    (Story) => (
      <ToastProvider>
        <LibraryContext.Provider value={library}>
          <div className="flex h-[852px] items-stretch">
            <Story />
          </div>
        </LibraryContext.Provider>
      </ToastProvider>
    ),
  ],
  args: {
    file,
    inTrash: false,
    onCopy: noop,
    onExport: noop,
    onReveal: noop,
    onTrash: noop,
    onRestore: noop,
    onPurge: noop,
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Обычный файл: источник, папка, теги, подробности, подвал с «Скопировать». */
export const Обычный: Story = {};

/** IMP-01 — блок решения о дубле стоит выше справочных «Подробностей». */
export const СДублем: Story = {
  name: 'С дублем',
  args: { file: { ...file, similarToFileId: twin.id } },
};

/**
 * В корзине: папка и теги не редактируются, в подвале — «Восстановить»
 * и «Удалить навсегда». Отдельного артборда у этого состояния нет —
 * собран в том же языке, что и обычный подвал.
 */
export const ВКорзине: Story = {
  name: 'В корзине',
  args: {
    inTrash: true,
    file: { ...file, deletedAt: '2026-09-02T18:00:00.000Z' },
  },
};

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FileSummary, SearchQuery, SearchResponse } from '@shared/api';
import { SearchPalette } from './SearchPalette';
import type { SearchChip } from './chips';

/**
 * Витрина не ходит на сервер: истории подставляют свой `fetchResults`, а данные
 * взяты с артбордов D01–D04 («Доработки от 11.09»), чтобы картинку можно было
 * сличать с макетом один в один.
 */
function file(id: number, name: string, folderPath: string | null, ext: FileSummary['ext']): FileSummary {
  return {
    id,
    originalFilename: name,
    ext,
    folderId: folderPath === null ? null : id,
    folderPath,
    // Превью в витрине нет — строка показывает пустую подложку, как при загрузке.
    previewUrl: null,
    originalUrl: `/api/files/${id}/original`,
  };
}

const FILES: FileSummary[] = [
  file(1, 'dashboard-linear-dark.png', 'Интерфейсы / Дашборды', 'png'),
  file(2, 'dashboard-stripe-analytics.png', 'Клиенты / Acme', 'png'),
  file(3, 'dashboard-vercel-usage.webp', 'Интерфейсы / Дашборды', 'webp'),
  file(4, 'dashboard-cards-grid.jpg', 'Лендинги', 'jpg'),
  file(5, 'dashboard-dark-empty.png', null, 'png'),
];

const POPULAR_TAGS = [
  'дашборд', 'тёмная тема', 'графики', 'лендинг', 'типографика',
  'мобилка', 'онбординг', 'айдентика', 'пустые состояния', 'формы',
].map((name, index) => ({ name, count: 142 - index * 11 }));

const EXTS: SearchResponse['exts'] = [
  { ext: 'png', count: 142 },
  { ext: 'jpg', count: 61 },
  { ext: 'jpeg', count: 0 },
  { ext: 'webp', count: 28 },
  { ext: 'gif', count: 4 },
  { ext: 'svg', count: 12 },
];

const ROOT_FOLDERS: SearchResponse['folders'] = [
  { id: 1, name: 'Интерфейсы', path: 'Интерфейсы', count: 24 },
  { id: 2, name: 'Дашборды', path: 'Интерфейсы / Дашборды', count: 9 },
  { id: 3, name: 'Acme', path: 'Клиенты / Acme', count: 18 },
  { id: 4, name: 'Лендинги', path: 'Лендинги', count: 31 },
  { id: 5, name: 'Типографика', path: 'Типографика', count: 7 },
];

/** Ответ «сервера» витрины: что показать, решает сама история. */
function stub(response: Partial<SearchResponse>) {
  return (_query: SearchQuery): Promise<SearchResponse> =>
    Promise.resolve({ files: [], tags: [], exts: [], folders: [], total: 0, ...response });
}

interface HarnessProps {
  response: Partial<SearchResponse>;
  text?: string;
  chips?: readonly SearchChip[];
}

/**
 * Модалка управляемая: открытым состоянием владеет вызывающий. В витрине держим
 * его здесь и не даём закрыться — иначе история схлопывалась бы на первом Esc.
 */
function Harness({ response, text, chips }: HarnessProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="h-[900px] w-full bg-app">
      <SearchPalette
        open={open}
        onOpenChange={(next) => setOpen(next || true)}
        fetchResults={stub(response)}
        initialText={text}
        initialChips={chips}
      />
    </div>
  );
}

const meta = {
  title: 'Поиск/Поиск-модалка',
  component: Harness,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** D01 — открыли и ничего не ввели: частые теги, форматы со счётчиками, корневые папки. */
export const Пусто: Story = {
  args: {
    response: { tags: POPULAR_TAGS, exts: EXTS, folders: ROOT_FOLDERS, total: 214 },
  },
};

/** D02 — ввод «дашб»: файлы, совпавшие теги со счётчиками и папки. Форматов здесь нет. */
export const Ввод: Story = {
  args: {
    text: 'дашб',
    response: {
      files: FILES,
      tags: [
        { name: 'дашборд', count: 142 },
        { name: 'дашборд · тёмный', count: 24 },
        { name: 'дашборды клиентов', count: 9 },
      ],
      exts: EXTS,
      folders: [
        { id: 2, name: 'Дашборды', path: 'Интерфейсы / Дашборды', count: 9 },
        { id: 6, name: 'Дашборды', path: 'Клиенты / Acme / Дашборды', count: 4 },
      ],
      total: 5,
    },
  },
};

/** D03 — закреплены `#дашборд` и `PNG`: подсказки уходят, остаются только файлы и счётчик в подвале. */
export const СЧипами: Story = {
  name: 'С чипами',
  args: {
    chips: [
      { kind: 'tag', value: 'дашборд' },
      { kind: 'ext', value: 'png' },
    ],
    response: {
      files: FILES.filter((item) => item.ext === 'png'),
      tags: POPULAR_TAGS,
      exts: EXTS,
      folders: ROOT_FOLDERS,
      total: 142,
    },
  },
};

/** D04 — ничего не нашлось: пустое состояние по образцу R12, подвал с подсказками остаётся. */
export const НичегоНеНайдено: Story = {
  name: 'Ничего не найдено',
  args: {
    text: 'xyz',
    response: { total: 0 },
  },
};

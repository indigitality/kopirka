import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip } from './Chip';

/**
 * Канон — R13 · «Карточка сетки и чипы» (мелкие, поверх превью) и
 * R09 / R05 / R14 (крупные, внутри панели).
 *
 * Мелкие чипы обязаны проверяться на картинке: у `light` и `dark` работает
 * `backdrop-filter`, которого в Paper не видно вовсе.
 */
const meta = {
  title: 'Примитивы/Чип',
  component: Chip,
  args: { children: 'дашборд', variant: 'control' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['light', 'dark', 'solid', 'control', 'brand', 'outline'],
    },
    as: { control: 'inline-radio', options: ['span', 'button'] },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Светлая картинка: белый чип с волосяной обводкой и тёмный чип папки. */
export const НаСветломПревью: Story = {
  name: 'Поверх превью · светлое',
  render: () => (
    <div className="relative flex h-[200px] w-[260px] flex-col justify-end gap-1 rounded-card bg-linear-to-br from-[#F6F6F4] to-[#DCDDE0] p-2">
      <Chip variant="dark" className="absolute top-2 left-2">
        Интерфейсы
      </Chip>
      <div className="flex flex-wrap gap-1">
        <Chip variant="light">Дашборд</Chip>
        <Chip variant="light">графики</Chip>
        <Chip variant="light">+2</Chip>
      </div>
    </div>
  ),
};

/** Тёмная картинка: сюда добавляется «Похоже дубль» — белый 95 %, вес 600. */
export const НаТёмномПревью: Story = {
  name: 'Поверх превью · тёмное',
  render: () => (
    <div className="relative flex h-[200px] w-[260px] flex-col justify-end gap-1 rounded-card bg-linear-to-br from-[#2A2B31] to-[#17181C] p-2">
      <Chip variant="dark" className="absolute top-2 left-2">
        Айдентика
      </Chip>
      <div className="flex gap-1">
        <Chip variant="solid">Похоже дубль</Chip>
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip variant="light">логотип</Chip>
        <Chip variant="light">знак</Chip>
        <Chip variant="light">+3</Chip>
      </div>
    </div>
  ),
};

/** Теги панели просмотра: `control` с крестиком по наведению и пунктирный «+ тег». */
export const ВПанели: Story = {
  name: 'В панели · теги',
  render: () => (
    <div className="flex flex-wrap gap-1.5 rounded-panel bg-panel p-5">
      <Chip variant="control" onRemove={() => {}}>
        прайсинг
      </Chip>
      <Chip variant="control" onRemove={() => {}}>
        карточки
      </Chip>
      <Chip variant="control" onRemove={() => {}}>
        тёмная тема
      </Chip>
      <Chip variant="outline" as="button">
        + тег
      </Chip>
    </div>
  ),
};

/** Фильтры R05: выбранный чип — сплошной лайм, невыбранные — `control`. */
export const Фильтры: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5 rounded-panel bg-panel p-5">
      <Chip variant="control" as="button">
        jpg
      </Chip>
      <Chip variant="brand" as="button">
        png
      </Chip>
      <Chip variant="control" as="button">
        webp
      </Chip>
      <Chip variant="control" as="button">
        gif
      </Chip>
      <Chip variant="control" as="button">
        svg
      </Chip>
    </div>
  ),
};

export const Состояния: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Chip variant="control" as="button">
        Покой
      </Chip>
      <Chip variant="control" as="button" className="pseudo-hover">
        Наведение
      </Chip>
      <Chip variant="control" as="button" className="pseudo-active">
        Нажатие
      </Chip>
      <Chip variant="outline" as="button" className="pseudo-hover">
        + тег
      </Chip>
      <Chip variant="control" as="button" disabled>
        Отключен
      </Chip>
    </div>
  ),
  parameters: { pseudo: { hover: ['.pseudo-hover'], active: ['.pseudo-active'] } },
};

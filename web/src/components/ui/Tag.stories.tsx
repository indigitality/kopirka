import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tag } from './Tag';

/**
 * `Tag` — тонкая обёртка над `Chip` (`control` и `outline`), оставленная ради
 * совместимости. Полный набор чипов редизайна — в истории «Примитивы/Чип».
 */
const meta = {
  title: 'Примитивы/Тег',
  component: Tag,
  args: { children: 'дашборд' },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Обычный: Story = {};

export const СУдалением: Story = {
  name: 'С удалением',
  args: { onRemove: () => {} },
};

export const Пунктирный: Story = {
  args: { dashed: true, children: '+ тег' },
};

export const Ряд: Story = {
  render: () => (
    <div className="flex flex-wrap gap-1.5">
      <Tag onRemove={() => {}}>прайсинг</Tag>
      <Tag onRemove={() => {}}>карточки</Tag>
      <Tag onRemove={() => {}}>тёмная тема</Tag>
      <Tag dashed>+ тег</Tag>
    </div>
  ),
};

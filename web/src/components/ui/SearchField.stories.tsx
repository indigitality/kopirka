import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchField } from './SearchField';

const meta = {
  title: 'Примитивы/Поиск',
  component: SearchField,
  args: { globalHotkey: false },
  decorators: [
    (Story) => (
      <div className="w-[280px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Пустое: Story = {};

export const СЗапросом: Story = {
  name: 'С запросом',
  args: { value: 'градиент' },
};

/** Наведение — заливка `control-hover`, больше ничего (R01). */
export const Наведение: Story = {
  parameters: { pseudo: { hover: true } },
};

/** Фокус — лаймовая обводка 1 px внутрь (R05). */
export const ВФокусе: Story = {
  name: 'В фокусе',
  args: { value: 'градиент' },
  parameters: { pseudo: { focusWithin: true } },
};

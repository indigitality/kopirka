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

/** Бим включается по наведению и фокусу, проходит три оборота и гаснет. */
export const Наведение: Story = {
  parameters: { pseudo: { hover: true } },
};

/** Режим для витрины: оборот, пауза 2 с, повтор. В приложении по умолчанию hover. */
export const Цикл: Story = {
  args: { beamMode: 'cycle' },
};

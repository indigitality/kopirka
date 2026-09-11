import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { SelectionBar } from './SelectionBar';
import { ToastProvider, useToast, type ToastOptions } from './Toast';

/**
 * Тост живёт в портале провайдера и всплывает снизу по центру, поэтому история —
 * это кнопка-триггер, а не сам компонент. Канон — R14 · «Тосты»: стеклянная
 * пилюля 40 px, радиус `--radius-card`, поля 14, без тени. Проверять стоит
 * стекло на подложке, паузу таймера под курсором и стопку из нескольких тостов.
 */
function Trigger({ label, options }: { label: string; options: ToastOptions }) {
  const { toast } = useToast();
  return (
    <Button variant="secondary" onClick={() => toast(options)}>
      {label}
    </Button>
  );
}

const meta = {
  title: 'Примитивы/Тост',
  component: Trigger,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="h-[280px]">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Trigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Обычный: Story = {
  args: { label: 'Показать тост', options: { title: 'Папка создана' } },
};

/** Успех: галка в макете лаймовая (`brand`), а не зелёная. */
export const Успех: Story = {
  args: { label: 'Показать успех', options: { title: 'Скопировано в буфер', tone: 'success' } },
};

/** Ошибка: `triangle-alert` и текст цветом `danger`. */
export const Ошибка: Story = {
  args: {
    label: 'Показать ошибку',
    options: { title: 'Не удалось прочитать файл', tone: 'danger' },
  },
};

/**
 * С действием. Полосы обратного отсчёта в редизайне нет — её убрали вслед за
 * макетом R14; пауза таймера под курсором осталась (аудит 4.23): наведите
 * курсор, уведите — тост доживёт остаток времени.
 */
export const СОтменой: Story = {
  name: 'С отменой · пауза под курсором',
  args: {
    label: 'Удалить файл',
    options: {
      title: 'Файл в корзине',
      action: { label: 'Отменить', onClick: () => {} },
    },
  },
};

/**
 * Стопка: новый тост встаёт снизу, каждый следующий сверху уезжает на 8 px
 * и теряет 20 % непрозрачности (`toastStackMotion`). Нажмите три раза подряд.
 */
export const Стопка: Story = {
  name: 'Стопка · три подряд',
  render: function СтопкаDemo() {
    const { toast } = useToast();
    const count = useRef(0);
    return (
      <Button
        variant="secondary"
        onClick={() => {
          count.current += 1;
          toast({
            title: `Файл ${count.current} в корзине`,
            action: { label: 'Отменить', onClick: () => {} },
          });
        }}
      >
        Добавить тост
      </Button>
    );
  },
  args: { label: 'Добавить тост', options: {} },
};

/**
 * «Полка» (дизайн-аудит 4.14–4.15). Раньше тост, панель выделения и прогресс
 * импорта делили точку `bottom-6` и налезали друг на друга. Теперь у них общий
 * контейнер `#kopirka-shelf`: тост уходит в него порталом, порядок задан `order`
 * в tokens.css, а центр считается по контенту, а не по окну.
 */
export const НаПолке: Story = {
  name: 'На полке · вместе с панелью выделения',
  args: { label: 'Показать тост', options: { title: 'Скопировано в буфер', tone: 'success' } },
  decorators: [
    (Story) => (
      <div className="relative h-[300px] overflow-hidden rounded-xl bg-bg">
        <div className="p-6">
          <Story />
        </div>
        <div id="kopirka-shelf" className="absolute inset-x-0 bottom-6">
          <SelectionBar
            count={3}
            total={12}
            onToggleAll={() => {}}
            className="shelf-selection"
            onMoveToFolder={() => {}}
            onTag={() => {}}
            onExport={() => {}}
            onDelete={() => {}}
            onCancel={() => {}}
          />
        </div>
      </div>
    ),
  ],
};

export const СоСводкой: Story = {
  name: 'Сводка импорта',
  args: {
    label: 'Импортировать',
    options: {
      stats: [
        { label: 'Добавлено', value: 48 },
        { label: 'Дубли', value: 2, tone: 'muted' },
        { label: 'Ошибки', value: 1, tone: 'danger' },
      ],
    },
  },
};

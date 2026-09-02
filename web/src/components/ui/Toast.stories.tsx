import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { ToastProvider, useToast, type ToastOptions } from './Toast';

/**
 * Тост живёт в портале провайдера и всплывает снизу по центру, поэтому история —
 * это кнопка-триггер, а не сам компонент. Проверять здесь стоит три вещи:
 * крестик закрытия, паузу таймера под курсором и тон `success`.
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

/** Тон успеха — «Сохранено», «Скопировано», «Файл вернулся» (дизайн-аудит §5). */
export const Успех: Story = {
  args: { label: 'Показать успех', options: { title: 'Скопировано в буфер', tone: 'success' } },
};

export const Ошибка: Story = {
  args: {
    label: 'Показать ошибку',
    options: { title: 'Не удалось прочитать файл', tone: 'danger' },
  },
};

/**
 * С действием: снизу идёт полоска остатка времени. Наведите курсор — таймер и
 * полоска встают на паузу, увели — идут дальше (аудит 4.23).
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

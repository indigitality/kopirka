import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { SettingsResponse } from '@shared/api';
import { DEFAULT_PORT } from '@shared/api';
import { SettingsModal } from './SettingsModal';

/**
 * Витрина панели настроек — артборд R10. Панель живёт в портале и занимает
 * всё окно, поэтому истории идут на `fullscreen`: рамка предпросмотра тут
 * только мешала бы сверке с макетом.
 *
 * Данные — заведомо неживые: настоящие настройки приходят из `GET /api/settings`,
 * а витрина обязана открываться без сервера.
 */
const settings: SettingsResponse = {
  libraryPath: '/Users/sergey/Pictures/Копирка',
  serverPort: DEFAULT_PORT,
  firstRunCompleted: true,
  schemaVersion: 1,
  logPath: '/Users/sergey/Library/Application Support/Kopirka/kopirka.log',
  appVersion: '0.1.0',
  librarySizeBytes: 1_503_238_553,
};

/**
 * Кнопка «Выбрать папку…» есть только в окне Tauri (`isTauri()`), а витрина —
 * обычный браузер, и без этой подмены R10 сверять было бы не с чем. Подменяем
 * ровно то, что читают `isTauri` и `pickDirectory`, и убираем за собой:
 * глобальная переменная не должна утечь в чужие истории.
 */
function fakeDesktop() {
  const host = window as unknown as Record<string, unknown>;
  if (host.__TAURI_INTERNALS__) return () => {};
  host.__TAURI_INTERNALS__ = {
    invoke: async () => '/Volumes/Referensy/Копирка',
    transformCallback: (callback: unknown) => callback,
  };
  return () => {
    delete host.__TAURI_INTERNALS__;
  };
}

const meta = {
  title: 'Экраны/Настройки',
  component: SettingsModal,
  parameters: { layout: 'fullscreen' },
  beforeEach: fakeDesktop,
  args: {
    open: true,
    onOpenChange: () => {},
    settings,
    onSave: async () => ({}),
  },
} satisfies Meta<typeof SettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Покой: ровно то, что нарисовано на R10, «Дополнительно» свёрнуто. */
export const Покой: Story = {};

/**
 * Правка не сохранена: подвал говорит об этом слева, «Отменить» и «Сохранить»
 * оживают. Печатаем в поле, а не подсовываем состояние — состояние формы
 * принадлежит панели, снаружи его выставить нечем.
 */
export const Изменения: Story = {
  name: 'Несохранённые изменения',
  play: async ({ canvasElement }) => {
    // Панель — в портале, а не внутри `canvasElement`, поэтому ищем по документу.
    const screen = within(canvasElement.ownerDocument.body);
    const field = await screen.findByLabelText('Путь библиотеки');
    await userEvent.clear(field);
    await userEvent.type(field, '/Volumes/Referensy/Копирка');
    await expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument();
  },
};

/**
 * Порт занят: сервер отвечает кодом `port_busy` ещё до записи в конфиг.
 * Свёрнутый блок «Дополнительно» раскрывается сам — иначе ошибка была бы
 * невидимой (D16).
 */
export const ПортЗанят: Story = {
  name: 'Ошибка порта',
  args: {
    onSave: async () => {
      const error = Object.assign(new Error('Порт 43118 уже занят другой программой'), {
        code: 'port_busy',
      });
      throw error;
    },
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(screen.getByRole('button', { name: 'Дополнительно' }));
    const port = await screen.findByLabelText('Порт');
    await userEvent.clear(port);
    await userEvent.type(port, '43118');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await expect(await screen.findByRole('alert')).toHaveTextContent('уже занят');
  },
};

/** Данные ещё не пришли: панель открыта, тело — одна строка ожидания. */
export const Загрузка: Story = {
  args: { settings: null },
};

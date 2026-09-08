import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OnboardingScreen } from './OnboardingScreen';

/**
 * Кнопка «Выбрать папку…» есть только в окне Tauri (`isTauri()`), а витрина —
 * обычный браузер, и без этой подмены R11 сверять было бы не с чем. Подменяем
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

/**
 * Витрина онбординга — артборд R11. Экран занимает всё окно (сам рисует поле
 * оболочки и панель), поэтому `fullscreen` и обёртка в высоту экрана: иначе
 * колонка не встанет по центру и сверять с макетом будет нечего.
 */
const meta = {
  title: 'Экраны/Онбординг',
  component: OnboardingScreen,
  parameters: { layout: 'fullscreen' },
  beforeEach: fakeDesktop,
  decorators: [
    (Story) => (
      <div className="h-screen w-full">
        <Story />
      </div>
    ),
  ],
  args: { onSubmit: () => {} },
} satisfies Meta<typeof OnboardingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Первый запуск: путь по умолчанию, подсказка под полем. */
export const Покой: Story = {};

/**
 * Путь Windows — так его увидит пользователь сборки под Windows: буква диска,
 * обратные слэши, `%USERPROFILE%` вместо тильды (`~` там не разворачивается).
 * Значение мока, не платформы: кнопки «Выбрать папку…» здесь по-прежнему нет
 * смысла включать платформенно — она зависит от `isTauri()`, а не от ОС, и в
 * витрине управляется отдельно (`fakeDesktop`).
 */
export const ПутьWindows: Story = {
  name: 'Путь Windows',
  args: { defaultPath: String.raw`C:\Users\sergey\Pictures\Копирка` },
};

/** Путь стёрли и отправили форму — ошибка встаёт на место подсказки. */
export const Ошибка: Story = {
  name: 'Пустой путь',
  args: { defaultPath: '' },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: 'Создать библиотеку' }));
    await expect(await screen.findByRole('alert')).toHaveTextContent('Укажите путь');
  },
};

/** Запрос ушёл: кнопка говорит «Создаём…» и не принимает второго нажатия. */
export const Ожидание: Story = {
  name: 'Создаём библиотеку',
  // Запрос, который не завершится: витрине нужно само состояние, а не его конец.
  args: { onSubmit: () => new Promise<void>(() => {}) },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await userEvent.click(screen.getByRole('button', { name: 'Создать библиотеку' }));
    await expect(await screen.findByRole('button', { name: 'Создаём…' })).toBeDisabled();
  },
};

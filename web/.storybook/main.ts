import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Витрина компонентов «Копирки».
 * Vite-конфиг приложения (Tailwind v4, алиасы @ и @shared) подхватывается
 * автоматически — отдельной настройки сборки здесь быть не должно,
 * иначе витрина и приложение начнут расходиться.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['storybook-addon-pseudo-states'],
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;

import type { Preview } from '@storybook/react-vite';
import { TooltipProvider } from '../src/components/ui/Tooltip';
import '../src/styles/tokens.css';

/**
 * Тема только тёмная (решение Сергея 30.08.2026), поэтому фон задаётся
 * жёстко токеном оболочки, а не переключателем фонов.
 */
const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    /* Канон интерфейса — артборд 1440×900 в Paper; держим его первым пресетом. */
    viewport: {
      options: {
        canon: { name: 'Канон 1440 × 900', styles: { width: '1440px', height: '900px' } },
        laptop: { name: 'Ноутбук 1280 × 800', styles: { width: '1280px', height: '800px' } },
        narrow: { name: 'Узкое окно 1024 × 720', styles: { width: '1024px', height: '720px' } },
      },
    },
  },
  decorators: [
    /*
      Провайдер тултипов — на весь предпросмотр: Radix требует его выше по
      дереву, а тултипы теперь висят и на кнопках внутри сайдбара и поиска.
      В приложении он стоит в `App.tsx`, здесь — эквивалент.
    */
    (Story) => (
      <TooltipProvider>
        <div className="min-h-[120px] bg-app p-6 font-sans text-ink antialiased">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default preview;

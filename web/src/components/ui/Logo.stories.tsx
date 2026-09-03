import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo, LogoMark, LogoWordmark, LOGO_MARK_SIZE } from './Logo';

/**
 * Логотип редизайна. Канон — узел «Логотип» в сайдбаре артборда R01
 * (фрейм «Для правок» в Paper): знак 14.647 × 29 лаймом, слово 68.824 × 15
 * цветом основного текста, зазор 10, поле слева 12.
 */
const meta = {
  title: 'Основа/Логотип',
  component: Logo,
  args: { size: LOGO_MARK_SIZE },
  argTypes: {
    size: { control: { type: 'range', min: 12, max: 96, step: 1 } },
    markOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ровно как в сайдбаре: связка на панели, с полем слева 12. */
export const Сайдбар: Story = {
  render: (args) => (
    <div className="w-[240px] rounded-panel bg-panel py-6">
      <div className="flex h-[32px] items-center pl-[var(--sidebar-logo-pad-x)]">
        <Logo {...args} />
      </div>
    </div>
  ),
};

/** Части по отдельности: цвет всегда снаружи, заливка внутри — `currentColor`. */
export const Части: Story = {
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <LogoMark size={args.size} className="text-brand" />
        <span className="label-section">знак · text-brand</span>
      </div>
      <div className="flex items-center gap-4">
        <LogoWordmark size={(args.size ?? LOGO_MARK_SIZE) * (15 / 29)} className="text-ink" />
        <span className="label-section">слово · text-ink</span>
      </div>
      <div className="flex items-center gap-4">
        <LogoMark size={args.size} className="text-ink" />
        <span className="label-section">знак монохромом</span>
      </div>
    </div>
  ),
};

/** Пропорции держатся на любой высоте: связка масштабируется целиком. */
export const Размеры: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6">
      {[16, 22, 29, 44, 64].map((size) => (
        <div key={size} className="flex items-center gap-4">
          <Logo size={size} />
          <span className="label-count">{size}</span>
        </div>
      ))}
    </div>
  ),
};

/** Только знак — для узкого сайдбара, иконки окна и пустых состояний. */
export const ТолькоЗнак: Story = {
  name: 'Только знак',
  args: { markOnly: true, size: 44 },
};

/** Онбординг: знак крупно на лаймовой подложке. */
export const НаСветлом: Story = {
  name: 'На светлом',
  render: () => (
    <div className="flex w-fit items-center gap-[10px] rounded-panel bg-brand px-8 py-6">
      <LogoMark size={44} className="text-brand-ink" />
      <LogoWordmark size={44 * (15 / 29)} className="text-brand-ink" />
    </div>
  ),
};

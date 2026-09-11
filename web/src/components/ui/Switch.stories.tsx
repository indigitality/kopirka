import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from './Switch';

/**
 * Тогл — D40 «Switch · состояния». Включает поведение, а не отмечает пункт:
 * этим он и отличается от чекбокса (§12 спеки).
 */
function Demo({ initial, disabled }: { initial: boolean; disabled?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      label="Снимок области экрана"
      checked={checked}
      onCheckedChange={setChecked}
      disabled={disabled}
    />
  );
}

const meta = {
  title: 'Примитивы/Тогл',
  component: Demo,
  args: { initial: false, disabled: false },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Два состояния рядом: дорожка `control-hover` → `brand`, бегунок `ink` → `brand-ink`
 * (правка Сергея 11.09 — белый бегунок на лайме сливался).
 */
export const Состояния: Story = {
  name: 'Выключен и включён',
  render: () => (
    <div className="flex items-center gap-6">
      <Demo initial={false} />
      <Demo initial />
    </div>
  ),
};

/** Недоступен — непрозрачность 50 %, указатель не ловится. */
export const Недоступен: Story = {
  name: 'Недоступен',
  render: () => (
    <div className="flex items-center gap-6">
      <Switch label="Выключен и недоступен" checked={false} disabled />
      <Switch label="Включён и недоступен" checked disabled />
    </div>
  ),
};

function WithLabel() {
  const [checked, setChecked] = useState(true);
  return <Switch labelText="Включено" checked={checked} onCheckedChange={setChecked} />;
}

/** Подпись слева — зазор 10, 13 / 16 · 500. */
export const СПодписью: Story = {
  name: 'С подписью слева',
  render: () => <WithLabel />,
};

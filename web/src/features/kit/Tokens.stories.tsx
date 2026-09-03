import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import type { FolderRecord } from '@shared/api';
import { Copy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchField } from '@/components/ui/SearchField';
import { Tag } from '@/components/ui/Tag';
import { Badge } from '@/components/ui/Badge';
import { FolderRow } from '@/features/shell/Sidebar';
import { mockFolders } from '@/features/shell/mock';

function firstFolder(): FolderRecord {
  const [first] = mockFolders;
  if (!first) throw new Error('Фикстура папок пуста');
  return first;
}

const folder = firstFolder();

const noop = () => {};

interface TokenArgs {
  brand: string;
  brandDeep: string;
  brandInk: string;
  control: string;
  controlHover: string;
  ink: string;
  inkMuted: string;
  lineStrong: string;
  radiusMd: number;
  radiusCard: number;
  sizeRow: number;
}

/**
 * Песочница токенов: контролы переопределяют CSS-переменные на контейнере,
 * поэтому значения тут же применяются ко всем компонентам внутри.
 *
 * Правка живёт только в этом просмотре — в `tokens.css` она не уезжает.
 * Подобрал значение → скажи его, перенесу в токены (или правь файл сам:
 * витрина перерисуется на лету).
 */
function Playground(args: TokenArgs) {
  const style = {
    '--color-brand': args.brand,
    '--color-brand-deep': args.brandDeep,
    '--color-brand-ink': args.brandInk,
    '--color-control': args.control,
    '--color-control-hover': args.controlHover,
    '--color-ink': args.ink,
    '--color-ink-muted': args.inkMuted,
    '--color-line-strong': args.lineStrong,
    '--radius-md': `${args.radiusMd}px`,
    '--radius-card': `${args.radiusCard}px`,
    '--size-row': `${args.sizeRow}px`,
  } as CSSProperties;

  return (
    <div style={style} className="flex flex-col gap-8 bg-bg">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<Copy />} hotkey="⌘C">Скопировать</Button>
        <Button variant="secondary" icon={<Plus />}>Добавить</Button>
        <Button variant="ghost">Отмена</Button>
        <Button variant="danger">Удалить</Button>
      </div>

      <div className="w-[280px]">
        <SearchField globalHotkey={false} value="градиент" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tag onRemove={noop}>дашборд</Tag>
        <Tag onRemove={noop}>тёмная тема</Tag>
        <Tag dashed>+ тег</Tag>
        <Badge>gif</Badge>
      </div>

      <div className="w-[240px] bg-surface px-4 py-2">
        <FolderRow
          folder={folder}
          depth={0}
          active
          collapsed={false}
          renaming={false}
          onSelect={noop}
          onToggle={noop}
          onCreateChild={noop}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Токены/Песочница',
  render: (args: TokenArgs) => <Playground {...args} />,
  args: {
    brand: '#c5fd63',
    brandDeep: '#a9e340',
    brandInk: '#17210a',
    control: 'rgb(186 186 193 / 0.10)',
    controlHover: 'rgb(186 186 193 / 0.15)',
    ink: '#f2f2f2',
    inkMuted: '#9a9aa2',
    lineStrong: '#33333c',
    radiusMd: 8,
    radiusCard: 12,
    sizeRow: 32,
  },
  argTypes: {
    brand: { control: 'color', name: 'Бренд — лайм' },
    brandDeep: { control: 'color', name: 'Бренд — нажатие' },
    brandInk: { control: 'color', name: 'Текст на лайме' },
    control: { control: 'text', name: 'Контрол — покой' },
    controlHover: { control: 'text', name: 'Контрол — выбран' },
    ink: { control: 'color', name: 'Текст основной' },
    inkMuted: { control: 'color', name: 'Текст вторичный' },
    lineStrong: { control: 'color', name: 'Граница' },
    radiusMd: { control: { type: 'range', min: 0, max: 20, step: 1 }, name: 'Радиус md' },
    radiusCard: { control: { type: 'range', min: 0, max: 24, step: 1 }, name: 'Радиус карточки' },
    sizeRow: { control: { type: 'range', min: 24, max: 48, step: 1 }, name: 'Высота строки' },
  },
} satisfies Meta<TokenArgs>;

export default meta;
type Story = StoryObj<TokenArgs>;

export const Песочница: Story = {};

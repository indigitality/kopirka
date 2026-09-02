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
  accent: string;
  accentDeep: string;
  accentInk: string;
  surfaceRaised: string;
  surfaceRow: string;
  ink: string;
  inkMuted: string;
  lineStrong: string;
  radiusMd: number;
  radiusLg: number;
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
    '--color-accent': args.accent,
    '--color-accent-deep': args.accentDeep,
    '--color-accent-ink': args.accentInk,
    '--color-surface-raised': args.surfaceRaised,
    '--color-surface-row': args.surfaceRow,
    '--color-ink': args.ink,
    '--color-ink-muted': args.inkMuted,
    '--color-line-strong': args.lineStrong,
    '--radius-md': `${args.radiusMd}px`,
    '--radius-lg': `${args.radiusLg}px`,
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
    accent: '#3ddbb0',
    accentDeep: '#21c39b',
    accentInk: '#04231b',
    surfaceRaised: '#131317',
    surfaceRow: 'rgb(242 242 242 / 0.14)',
    ink: '#f2f2f2',
    inkMuted: '#9a9aa2',
    lineStrong: '#33333c',
    radiusMd: 8,
    radiusLg: 10,
    sizeRow: 32,
  },
  argTypes: {
    accent: { control: 'color', name: 'Акцент' },
    accentDeep: { control: 'color', name: 'Акцент — дальний край' },
    accentInk: { control: 'color', name: 'Текст на акценте' },
    surfaceRaised: { control: 'color', name: 'Приподнятая поверхность' },
    surfaceRow: { control: 'text', name: 'Подсветка строки' },
    ink: { control: 'color', name: 'Текст основной' },
    inkMuted: { control: 'color', name: 'Текст вторичный' },
    lineStrong: { control: 'color', name: 'Граница' },
    radiusMd: { control: { type: 'range', min: 0, max: 20, step: 1 }, name: 'Радиус md' },
    radiusLg: { control: { type: 'range', min: 0, max: 24, step: 1 }, name: 'Радиус lg' },
    sizeRow: { control: { type: 'range', min: 24, max: 48, step: 1 }, name: 'Высота строки' },
  },
} satisfies Meta<TokenArgs>;

export default meta;
type Story = StoryObj<TokenArgs>;

export const Песочница: Story = {};

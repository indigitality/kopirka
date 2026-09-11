import { useState, type ReactNode } from 'react';
import { Copy, Folder, Grid2x2, Grid3x3, ImageDown, Plus, Square, Trash2 } from 'lucide-react';
import { iconProps } from '@/lib/icons';
import { flattenFolders } from '@/lib/folders';
import { hotkeyLabel, platformStrings } from '@/lib/platform';
import { mockFolders } from '@/features/shell/mock';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from '@/components/ui/Popover';
import { SearchField } from '@/components/ui/SearchField';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { SelectionBar } from '@/components/ui/SelectionBar';
import { Tag } from '@/components/ui/Tag';
import { Tooltip } from '@/components/ui/Tooltip';
import { importSummaryToast, useToast } from '@/components/ui/Toast';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-11 first:mt-0">
      <div className="mb-4 flex items-center gap-3">
        <span className="label-section shrink-0">{title}</span>
        <span className="h-px flex-1 bg-line" aria-hidden />
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-6 py-2">
      <span className="w-[148px] shrink-0 pt-1.5 text-sm text-ink-faint">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

/**
 * Размер карточек сетки — решение D5, дизайн-аудит §3.3.
 * Функция, а не константа модуля: подпись хоткея зависит от платформы
 * (`hotkeyLabel`), читаем которую можно только при рендере — см. тот же
 * приём в `TopBar.gridSizeOptions`.
 */
function gridSizeOptions(): readonly SegmentedOption<string>[] {
  return [
    { value: 'l', label: 'Большие', hotkey: hotkeyLabel('⌘1'), icon: <Square {...iconProps(16)} /> },
    { value: 'm', label: 'Средние', hotkey: hotkeyLabel('⌘2'), icon: <Grid2x2 {...iconProps(16)} /> },
    { value: 's', label: 'Маленькие', hotkey: hotkeyLabel('⌘3'), icon: <Grid3x3 {...iconProps(16)} /> },
  ];
}

const VIEW_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: 'any', label: 'Любые' },
  { value: 'landscape', label: 'Горизонтальные' },
  { value: 'portrait', label: 'Вертикальные' },
];

const folderOptions = flattenFolders(mockFolders).map(({ folder, depth }) => ({
  value: folder.id,
  label: folder.name,
  depth,
  icon: <Folder {...iconProps(16)} />,
}));

export function KitPage() {
  const platform = platformStrings();
  const { toast } = useToast();
  const [tags, setTags] = useState(['интерфейс', 'дашборд', 'тёмная тема']);
  const [checked, setChecked] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(folderOptions[0]?.value ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectionCount, setSelectionCount] = useState(3);
  const [gridSize, setGridSize] = useState('m');
  const [orientation, setOrientation] = useState('any');

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[960px] px-10 pt-12 pb-24">
        <header className="mb-10">
          <h1 className="text-2xl font-medium tracking-tight text-ink">Копирка · дизайн-система</h1>
          <p className="text-technical mt-1.5">
            тёмная тема · Inter Tight · все значения из tokens.css
          </p>
        </header>

        {/*
          Что появилось в редизайне и чего не было на старой витрине.
          Подробный разбор по состояниям — в Storybook, раздел «Примитивы».
        */}
        <Section title="Редизайн · новое">
          <Row label="Чип · поверх превью">
            <span className="flex items-center gap-1 rounded-card bg-linear-to-br from-[#EDEDE9] to-[#C3C6CD] p-2">
              <Chip variant="dark">Интерфейсы</Chip>
              <Chip variant="light">дашборд</Chip>
              <Chip variant="light">+2</Chip>
              <Chip variant="solid">Похоже дубль</Chip>
            </span>
          </Row>
          <Row label="Чип · в панели">
            <Chip variant="control" onRemove={() => {}}>
              прайсинг
            </Chip>
            <Chip variant="brand" as="button">
              png
            </Chip>
            <Chip variant="outline" as="button">
              + тег
            </Chip>
          </Row>
          <Row label="Кнопка · большая">
            <Button variant="primary" size="lg">
              Создать библиотеку
            </Button>
          </Row>
          <Row label="Кнопка-иконка · стекло">
            <span className="flex items-center gap-2 rounded-card bg-linear-to-br from-[#EDEDE9] to-[#C3C6CD] p-3">
              <IconButton label="Назад" variant="glass" size="lg" shape="round">
                <Copy {...iconProps(16)} />
              </IconButton>
              <IconButton label="Закрыть" variant="glass">
                <Plus {...iconProps(16)} />
              </IconButton>
            </span>
          </Row>
          <Row label="Чекбокс · квадратный">
            <Checkbox shape="square" checked={checked} onCheckedChange={setChecked} />
            <Checkbox shape="square" checked onCheckedChange={() => {}} />
          </Row>
          <Row label="Бейдж · счётчик">
            <Badge variant="brand">5</Badge>
            <Badge variant="count">24</Badge>
          </Row>
        </Section>

        <Section title="Кнопки">
          <Row label="Первичная">
            <Button variant="primary">Скопировать</Button>
            <Button variant="primary" size="sm">
              Скопировать
            </Button>
            <Button variant="primary" icon={<Copy {...iconProps(16)} />}>
              С иконкой
            </Button>
            <Button variant="primary" hotkey={hotkeyLabel('⌘C')}>
              С хоткеем
            </Button>
            <Button variant="primary" disabled>
              Выключена
            </Button>
          </Row>
          <Row label="Вторичная">
            <Button variant="secondary">{platform.revealButton}</Button>
            <Button variant="secondary" size="sm">
              {platform.revealButton}
            </Button>
            <Button variant="secondary" icon={<Folder {...iconProps(16)} />}>
              С иконкой
            </Button>
            <Button variant="secondary" hotkey={hotkeyLabel('⌘R')}>
              С хоткеем
            </Button>
            <Button variant="secondary" disabled>
              Выключена
            </Button>
          </Row>
          <Row label="Призрачная">
            <Button variant="ghost">Отменить</Button>
            <Button variant="ghost" size="sm">
              Отменить
            </Button>
            <Button variant="ghost" icon={<Plus {...iconProps(16)} />}>
              С иконкой
            </Button>
            <Button variant="ghost" hotkey="Esc">
              С хоткеем
            </Button>
            <Button variant="ghost" disabled>
              Выключена
            </Button>
          </Row>
          <Row label="Опасная">
            <Button variant="danger">Удалить</Button>
            <Button variant="danger" size="sm">
              Удалить
            </Button>
            <Button variant="danger" icon={<Trash2 {...iconProps(16)} />}>
              С иконкой
            </Button>
            <Button variant="danger" hotkey="⌫">
              С хоткеем
            </Button>
            <Button variant="danger" disabled>
              Выключена
            </Button>
          </Row>
          {/* Необратимое действие: мягкий danger по весу равен «Отмене» (аудит 4.22). */}
          <Row label="Опасная сплошная">
            <Button variant="secondary">Отмена</Button>
            <Button variant="danger-solid">Удалить навсегда</Button>
            <Button variant="danger-solid" size="sm">
              Удалить навсегда
            </Button>
            <Button variant="danger-solid" icon={<Trash2 {...iconProps(16)} />}>
              С иконкой
            </Button>
            <Button variant="danger-solid" disabled>
              Выключена
            </Button>
          </Row>
        </Section>

        <Section title="Кнопки-иконки">
          <Row label="32 × 32">
            <IconButton label="Скопировать">
              <Copy {...iconProps(16)} />
            </IconButton>
            <IconButton label="Папка" variant="secondary">
              <Folder {...iconProps(16)} />
            </IconButton>
            <IconButton label="Удалить" variant="danger">
              <Trash2 {...iconProps(16)} />
            </IconButton>
          </Row>
          <Row label="28 × 28">
            <IconButton label="Скопировать" size="sm">
              <Copy {...iconProps(16)} />
            </IconButton>
            <IconButton label="Папка" size="sm" variant="secondary">
              <Folder {...iconProps(16)} />
            </IconButton>
            <IconButton label="Удалить" size="sm" variant="danger">
              <Trash2 {...iconProps(16)} />
            </IconButton>
          </Row>
        </Section>

        <Section title="Поля">
          <Row label="Input">
            <Input placeholder="Имя папки" className="w-[200px]" />
            <Input defaultValue="Дашборды" className="w-[200px]" />
            <Input placeholder="Выключено" disabled className="w-[200px]" />
          </Row>
        </Section>

        <Section title="Поиск">
          <div className="flex flex-wrap gap-10">
            <div>
              <p className="text-technical mb-2">покой · {hotkeyLabel('⌘K')} фокусирует</p>
              <SearchField />
            </div>
            <div>
              <p className="text-technical mb-2">с запросом · крестик очистки</p>
              <SearchField value="градиент" globalHotkey={false} />
            </div>
          </div>
        </Section>

        <Section title="Теги">
          <Row label="Обычный">
            <Tag>интерфейс</Tag>
            <Tag>дашборд</Tag>
          </Row>
          <Row label="С удалением">
            {tags.map((tag) => (
              <Tag key={tag} onRemove={() => setTags((prev) => prev.filter((item) => item !== tag))}>
                {tag}
              </Tag>
            ))}
            {tags.length === 0 ? (
              <button
                type="button"
                className="text-sm text-ink-faint underline underline-offset-2 hover:text-ink"
                onClick={() => setTags(['интерфейс', 'дашборд', 'тёмная тема'])}
              >
                вернуть теги
              </button>
            ) : null}
            <Tag dashed>+ тег</Tag>
          </Row>
        </Section>

        <Section title="Бейджи">
          <Row label="Варианты">
            <Badge>похоже, дубль</Badge>
            <Badge>gif</Badge>
            <Badge>Интерфейсы</Badge>
            <Badge variant="danger">битый файл</Badge>
          </Row>
          <Row label="Поверх превью">
            <div className="relative h-[112px] w-[168px] overflow-hidden rounded-md bg-linear-to-br from-surface-active to-surface-raised">
              <Badge className="absolute top-1.5 right-1.5">похоже, дубль</Badge>
              <Badge className="absolute bottom-1.5 left-1.5">gif</Badge>
              <Checkbox
                checked={checked}
                onCheckedChange={setChecked}
                className="absolute top-1.5 left-1.5"
              />
            </div>
          </Row>
        </Section>

        <Section title="Чекбокс">
          <Row label="20px, круглый">
            <Checkbox checked={checked} onCheckedChange={setChecked} />
            <Checkbox checked onCheckedChange={() => undefined} />
            <span className="text-sm text-ink-faint">
              {checked ? 'выделено' : 'не выделено'}
            </span>
          </Row>
        </Section>

        <Section title="Селект">
          <Row label="Выбор папки">
            <div className="w-[240px]">
              <Select
                value={folderId}
                onValueChange={setFolderId}
                options={folderOptions}
                icon={<Folder {...iconProps(16)} />}
                placeholder="Без папки"
              />
            </div>
          </Row>
        </Section>

        {/* Один тип переключателя на всё — дизайн-аудит §8.1. */}
        <Section title="Сегментный контрол">
          <Row label="Размер сетки">
            <SegmentedControl
              label="Размер карточек"
              value={gridSize}
              onValueChange={setGridSize}
              options={gridSizeOptions()}
              segmentWidth={32}
            />
            <span className="text-technical">
              иконки, 32 × 28, тултипы с хоткеями
            </span>
          </Row>
          <Row label="С текстом">
            <SegmentedControl
              label="Ориентация"
              value={orientation}
              onValueChange={setOrientation}
              options={VIEW_OPTIONS}
            />
          </Row>
        </Section>

        <Section title="Оверлеи">
          <Row label="Поповер">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">Открыть поповер</Button>
              </PopoverTrigger>
              <PopoverContent>
                <PopoverItem>Переименовать</PopoverItem>
                <PopoverItem>Новая подпапка</PopoverItem>
                <PopoverSeparator />
                <PopoverItem className="text-danger hover:bg-danger-soft hover:text-danger">
                  Удалить папку
                </PopoverItem>
              </PopoverContent>
            </Popover>
          </Row>
          <Row label="Модалка">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Открыть модалку
            </Button>
          </Row>
          <Row label="Тултип">
            <Tooltip content="Скопировать в буфер" hotkey={hotkeyLabel('⌘C')}>
              <IconButton label="Скопировать" variant="secondary">
                <Copy {...iconProps(16)} />
              </IconButton>
            </Tooltip>
          </Row>
          <Row label="Контекстное меню">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex h-[72px] w-[240px] items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-ink-faint select-none">
                  Правый клик здесь
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem hotkey="⏎">Открыть</ContextMenuItem>
                <ContextMenuItem hotkey={hotkeyLabel('⌘C')}>Скопировать</ContextMenuItem>
                <ContextMenuItem>{platform.revealMenuItem}</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem danger hotkey="⌫">
                  Удалить
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </Row>
        </Section>

        <Section title="Тосты">
          <Row label="Варианты">
            <Button
              variant="secondary"
              onClick={() =>
                toast({
                  title: 'Файл удалён',
                  action: { label: 'Отменить', onClick: () => toast({ title: 'Удаление отменено' }) },
                })
              }
            >
              Удаление с отменой
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast(importSummaryToast({ added: 48, duplicates: 2, similar: 0, errors: 1 }))
              }
            >
              Сводка импорта
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast({ title: 'Скопировано в буфер', tone: 'success' })}
            >
              Успех
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast({ title: 'Не удалось прочитать файл', tone: 'danger' })}
            >
              Ошибка
            </Button>
          </Row>
        </Section>

        <Section title="Панель массового выделения">
          <div className="flex h-[92px] items-center justify-center rounded-md bg-surface">
            {selectionCount > 0 ? (
              <SelectionBar
                count={selectionCount}
                total={12}
                onToggleAll={() => setSelectionCount((current) => (current >= 12 ? 0 : 12))}
                onMoveToFolder={() => toast({ title: 'Выбор папки для 3 файлов' })}
                onTag={() => toast({ title: 'Добавление тега к 3 файлам' })}
                onExport={() => toast({ title: 'Экспорт 3 файлов в папку' })}
                onDelete={() =>
                  toast({
                    title: 'Файлы удалены',
                    action: { label: 'Отменить', onClick: () => setSelectionCount(3) },
                  })
                }
                onCancel={() => setSelectionCount(0)}
              />
            ) : (
              <Button variant="ghost" onClick={() => setSelectionCount(3)}>
                Выделить 3 файла
              </Button>
            )}
          </div>
        </Section>

        <Section title="Пустое состояние">
          <div className="rounded-md bg-surface">
            <EmptyState
              icon={<ImageDown {...iconProps(20)} />}
              title="Перетащите изображения сюда"
              description="Или сохраните картинку из браузера через контекстное меню «Сохранить в Копирку»."
              action={
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Как это работает
                </Button>
              }
            />
          </div>
        </Section>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent
          title="Как файлы попадают в Копирку"
          description="Четыре пути импорта из MVP: контекстное меню браузера, скриншот вкладки, перетаскивание и вставка из буфера."
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Закрыть
              </Button>
              <Button variant="primary" hotkey="⏎" onClick={() => setModalOpen(false)}>
                Понятно
              </Button>
            </>
          }
        >
          <div className="rounded-md bg-surface-raised p-3">
            <p className="text-technical">
              CAP-01 · CAP-02 · CAP-03 · CAP-04
            </p>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

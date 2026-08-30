/**
 * Витрина трёх экранов: настройки, онбординг, панель фильтров.
 * Отдельный вход Vite (`/preview.html?screen=…`), чтобы не трогать `App.tsx`.
 *
 * По умолчанию сохранение настроек и завершение онбординга не уходят на сервер —
 * дев-библиотека общая с соседним агентом. Реальные запросы включаются флагом `&live`.
 */
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppConfig, FileListQuery, SettingsResponse, TagRecord } from '@shared/api';
import './styles/tokens.css';
import { SettingsScreen, fetchSettings, patchSettings } from '@/features/settings';
import { completeOnboarding } from '@/features/settings/api';
import { OnboardingScreen } from '@/features/onboarding';
import { FilterButton, FilterPanel, countActiveFilters } from '@/features/filters';
import { cn } from '@/lib/cn';

const params = new URLSearchParams(window.location.search);
const screen = params.get('screen') ?? 'settings';
const live = params.has('live');

/** Демо-теги: в тестовой библиотеке тегов нет, а список надо увидеть заполненным. */
const DEMO_TAGS: TagRecord[] = [
  { id: 1, name: 'типографика', fileCount: 48 },
  { id: 2, name: 'лендинг', fileCount: 31 },
  { id: 3, name: 'тёмная тема', fileCount: 22 },
  { id: 4, name: 'дашборд', fileCount: 17 },
  { id: 5, name: 'иллюстрация', fileCount: 12 },
  { id: 6, name: 'мобильное', fileCount: 9 },
  { id: 7, name: 'айдентика', fileCount: 7 },
  { id: 8, name: 'анимация', fileCount: 4 },
];

function SettingsPreview() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const onSave = useCallback(
    async (patch: Partial<AppConfig>) => {
      if (live) {
        const next = await patchSettings(patch);
        setSettings(next);
        return { restartRequired: next.restartRequired };
      }
      // Сухой прогон: показываем результат, но конфиг общей дев-библиотеки не трогаем.
      await new Promise((resolve) => setTimeout(resolve, 400));
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      return { restartRequired: patch.serverPort !== undefined };
    },
    [],
  );

  return <SettingsScreen settings={settings} onSave={onSave} onClose={() => undefined} />;
}

function OnboardingPreview() {
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <p className="text-technical">Библиотека создана: {done}</p>
      </div>
    );
  }

  return (
    <OnboardingScreen
      onSubmit={async (path) => {
        if (live) await completeOnboarding(path);
        else await new Promise((resolve) => setTimeout(resolve, 400));
        setDone(path);
      }}
    />
  );
}

/** Заглушка сетки — только фон, чтобы видеть, как панель ложится поверх карточек. */
function GridStub() {
  const heights = [220, 320, 180, 260, 300, 200, 340, 240, 190, 280, 210, 300];
  return (
    <div
      className="p-[var(--grid-pad)]"
      style={{ columnCount: 4, columnGap: 'var(--grid-gap)' }}
      aria-hidden
    >
      {heights.map((height, index) => (
        <div
          key={index}
          className="mb-[var(--grid-gap)] w-full break-inside-avoid rounded-md bg-surface-raised"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function FiltersPreview() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState<FileListQuery>({ scope: 'library', tags: ['лендинг'], exts: ['png'] });
  const [tags, setTags] = useState<readonly TagRecord[]>(DEMO_TAGS);

  useEffect(() => {
    fetch('/api/tags')
      .then((response) => response.json() as Promise<TagRecord[]>)
      .then((list) => setTags(list.length ? list : DEMO_TAGS))
      .catch(() => setTags(DEMO_TAGS));
  }, []);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-[var(--size-topbar)] shrink-0 items-center bg-surface px-[var(--grid-pad)]">
        <div className="h-[34px] w-[280px] rounded-lg bg-surface-raised" aria-hidden />
        <div className="flex-1" />
        <FilterButton count={countActiveFilters(query)} open={open} onClick={() => setOpen((v) => !v)} />
      </header>

      {/* Панель абсолютная — область контента должна быть `relative`. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <GridStub />
        <FilterPanel
          open={open}
          onOpenChange={setOpen}
          value={query}
          onChange={setQuery}
          tags={tags}
        />
      </div>
    </div>
  );
}

const SCREENS = [
  { key: 'settings', label: 'Настройки', node: <SettingsPreview /> },
  { key: 'onboarding', label: 'Онбординг', node: <OnboardingPreview /> },
  { key: 'filters', label: 'Фильтры', node: <FiltersPreview /> },
] as const;

function Preview() {
  const current = SCREENS.find((item) => item.key === screen) ?? SCREENS[0];

  return (
    <div className="flex h-full flex-col bg-bg">
      <nav className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-surface px-3">
        <span className="label-section mr-2">Витрина</span>
        {SCREENS.map((item) => (
          <a
            key={item.key}
            href={`?screen=${item.key}${live ? '&live' : ''}`}
            className={cn(
              'flex h-6 items-center rounded-sm px-2 text-sm',
              item.key === current.key ? 'bg-surface-active text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </a>
        ))}
        <div className="flex-1" />
        <span className="font-mono text-2xs text-ink-faint">{live ? 'live' : 'dry-run'}</span>
      </nav>
      <div className="min-h-0 flex-1">{current.node}</div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);

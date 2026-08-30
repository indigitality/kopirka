/**
 * Ввод тега с автодополнением по уже существующим тегам.
 * Теги нормализованы сервером (нижний регистр, схлопнутые пробелы) — 5.5 PRD,
 * поэтому сравниваем и подсказываем по нормализованной форме.
 */
import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

/** Та же нормализация, что на сервере: иначе подсказки разойдутся с реальностью. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface TagInputProps {
  /** Все теги библиотеки — источник подсказок. */
  known: readonly string[];
  /** Уже проставленные: их не предлагаем. */
  exclude?: readonly string[];
  onSubmit: (tag: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_SUGGESTIONS = 6;

export function TagInput({
  known,
  exclude = [],
  onSubmit,
  onCancel,
  placeholder = 'Название тега',
  autoFocus = true,
  className,
}: TagInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const taken = new Set(exclude.map(normalizeTag));
    const needle = normalizeTag(value);
    return known
      .filter((tag) => !taken.has(normalizeTag(tag)))
      .filter((tag) => needle === '' || normalizeTag(tag).includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }, [known, exclude, value]);

  const submit = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag === '') return;
    onSubmit(tag);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <Input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit(value);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel?.();
          }
        }}
      />
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => submit(tag)}
              className={cn(
                'inline-flex h-6 max-w-full items-center rounded-pill bg-surface-active px-2.5 text-sm',
                'text-ink-muted transition-colors duration-[var(--dur-fast)] ease-out hover:text-ink',
              )}
            >
              <span className="truncate">{tag}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

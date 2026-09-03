/**
 * Ввод тега с автодополнением по уже существующим тегам.
 * Теги нормализованы сервером (нижний регистр, схлопнутые пробелы) — 5.5 PRD,
 * поэтому сравниваем и подсказываем по нормализованной форме.
 */
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
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
  /** Если задан — справа от поля первичная кнопка с этим текстом (02 §4.25). */
  submitLabel?: string;
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
  submitLabel,
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
    <div className={cn('flex w-full flex-col gap-2.5', className)}>
      <div className="flex items-center gap-2">
        {/* Поле — примитив редизайна: подложка контрола, высота 34, лаймовая обводка по фокусу. */}
        <Input
          ref={inputRef}
          className="min-w-0 flex-1"
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
        {submitLabel ? (
          <Button
            variant="primary"
            disabled={normalizeTag(value) === ''}
            onClick={() => submit(value)}
          >
            {submitLabel}
          </Button>
        ) : null}
      </div>
      {suggestions.length > 0 ? (
        /* Подсказки — те же пилюли 26 px, что и теги файла (узел «Теги», R09). */
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <Chip
              key={tag}
              as="button"
              variant="control"
              onClick={() => submit(tag)}
              className="text-ink-muted hover:text-ink"
            >
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

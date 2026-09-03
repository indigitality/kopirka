/**
 * Поповер редизайна — стеклянный слой. Канон: R14 · «Меню и поповеры»,
 * R13 · «Стекло и движение».
 *
 * Тело: `.glass` (raised-glass + `backdrop-filter: blur(20px)` + край
 * `line-strong`), радиус `--radius-card`, тень `--shadow-popover`, поле 6,
 * ширина 200–210. Строка: 30 px, радиус `--radius-sm`, поля 10, текст 14/18 · 500.
 *
 * Метрики строки сняты с `FEK-0` (поповер сортировки на живом экране R06) и
 * совпадают с ролью «пункт меню» из шкалы редизайна. В R14 те же строки
 * набраны на пункт мельче — расхождение самого макета; берём живой экран.
 *
 * Правило Сергея (02.09.2026): строки поповеров **полупрозрачные** —
 * `--color-control` под курсором, `--color-control-hover` у текущей; плотных
 * заливок здесь нет вовсе, иначе стекло перестаёт читаться как стекло.
 * Разделитель идёт от края до края и красится цветом обводки контейнера,
 * поэтому у него отрицательные горизонтальные поля.
 *
 * Появление — `glassLayerMotion` (blur 8 → 0, сдвиг 8 px, пружина 380/32).
 * Сторона приезда выводится из `side`, который Radix кладёт в data-атрибут.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  type WheelEvent,
} from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion, sideToFrom } from './motion-presets';

/**
 * Открыт ли поповер — Radix наружу это не отдаёт, а `AnimatePresence` без
 * такого флага не сыграет уход: с `forceMount` контент живёт всегда, и решать,
 * когда его снять, приходится нам.
 */
const OpenContext = createContext(false);

export type PopoverProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>;

/** Корень поповера. Работает и управляемым, и неуправляемым — как примитив Radix. */
export function Popover({ open, defaultOpen, onOpenChange, children, ...rest }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolled;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} {...rest}>
      <OpenContext.Provider value={isOpen}>{children}</OpenContext.Provider>
    </PopoverPrimitive.Root>
  );
}

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** Общий вид стеклянного слоя: тело поповера, меню и выпадающего списка. */
export const GLASS_LAYER = 'glass rounded-card shadow-popover outline-none';

/**
 * Общий вид строки внутри стеклянного слоя: 30 px, радиус `--radius-sm`,
 * поля 10, текст 14/18 · 500 (роль «пункт меню» из шкалы редизайна).
 */
export const GLASS_ROW =
  'flex h-[var(--size-menu-row)] w-full items-center gap-2 rounded-sm px-2.5 text-left text-md leading-[18px] font-medium text-ink select-none transition-colors duration-[var(--dur-fast)] ease-out';

export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent(
  { className, align = 'start', side = 'bottom', sideOffset = 6, onWheel, children, ...rest },
  ref,
) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotion();

  /*
    Колесо мыши внутри модалки. Radix Dialog в модальном режиме оборачивает своё
    содержимое в `react-remove-scroll`; тот слушает `wheel` на `document` в фазе
    всплытия и `preventDefault`-ит всё, чего не видел внутри замка. Поповер живёт
    порталом в `<body>` — то есть вне замка, и список папок переставал крутиться
    (баг «Переместить в папку», 03.09.2026).

    Гасим всплытие в React-обработчике: React вешает делегата на контейнер
    портала (`<body>`), а `document` идёт по пути события выше него, поэтому до
    `react-remove-scroll` колесо просто не доходит. Нативную прокрутку списка это
    не трогает — `preventDefault` мы не зовём.

    Глушим всегда, а не только внутри модалки: своих слушателей `wheel` на
    `document` у «Копирки» нет, а «внутри модалки или нет» поповер не знает и
    знать не должен.
  */
  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      onWheel?.(event);
      event.stopPropagation();
    },
    [onWheel],
  );

  return (
    <AnimatePresence>
      {open ? (
        <PopoverPrimitive.Portal forceMount key="popover">
          <PopoverPrimitive.Content
            ref={ref}
            forceMount
            align={align}
            side={side}
            sideOffset={sideOffset}
            onWheel={handleWheel}
            asChild
            {...rest}
          >
            <motion.div
              {...glassLayerMotion({ from: sideToFrom(side), reduced })}
              className={cn(GLASS_LAYER, 'z-50 min-w-[210px] p-1.5 text-ink', className)}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
});

export interface PopoverItemProps extends ComponentPropsWithoutRef<'button'> {
  /** Текущий пункт списка: подложка плотнее ховера и справа лаймовая галка. */
  current?: boolean;
  /** Хоткей справа — 10 px, приглушённый. */
  hotkey?: string;
  danger?: boolean;
  children?: ReactNode;
}

/** Строка меню внутри поповера. */
export const PopoverItem = forwardRef<HTMLButtonElement, PopoverItemProps>(
  function PopoverItem({ className, current, hotkey, danger, children, type, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        data-current={current ? '' : undefined}
        className={cn(
          GLASS_ROW,
          danger ? 'text-danger hover:bg-danger-tint' : 'hover:bg-control focus-visible:bg-control',
          current && 'bg-control-hover',
          'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
        {...rest}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {hotkey ? (
          <span className="shrink-0 text-2xs leading-3 font-normal text-ink-faint">{hotkey}</span>
        ) : null}
      </button>
    );
  },
);

/**
 * Разделитель. Отрицательные поля вытягивают его на всю ширину слоя —
 * правило Сергея: линия идёт от края до края и цветом обводки контейнера.
 */
export const PopoverSeparator = ({ className }: { className?: string }) => (
  <div className={cn('-mx-1.5 my-1.5 h-px bg-line-strong', className)} />
);

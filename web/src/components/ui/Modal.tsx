/**
 * Модалка. Канон — R14 · «Подтверждение действия», «Массовые действия»,
 * «Похоже, уже есть».
 *
 * Тело: плотная панель `raised` (не стекло — модалка лежит на скриме и
 * подмешивать ей фон нечего), обводка `line-strong`, радиус `--radius-panel`,
 * тень `--shadow-modal`, поле 24, зазор между полосами 16.
 * Заголовок 20/26 · 500 · `tracking-tight`; описание 14/20 `ink-muted`;
 * крестик 16 `ink-muted` в правом верхнем углу, приподнят на 5 px к первой
 * строке заголовка. Подвал — кнопки справа, зазор 8.
 *
 * Скрим — 72 % за 160 мс (`scrimMotion`), тело — `modalMotion`
 * (scale 0.96 → 1, blur 6 → 0, пружина 380/32); стартуют одновременно.
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
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from '@/lib/icons';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { modalMotion, scrimMotion } from './motion-presets';

/** Открыта ли модалка: с `forceMount` Radix наружу этого не отдаёт. */
const OpenContext = createContext(false);

export type ModalProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

/** Корень модалки. API — как у примитива Radix: управляемый и неуправляемый. */
export function Modal({ open, defaultOpen, onOpenChange, children, ...rest }: ModalProps) {
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
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} {...rest}>
      <OpenContext.Provider value={isOpen}>{children}</OpenContext.Provider>
    </DialogPrimitive.Root>
  );
}

export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

/**
 * Три ширины из R14: подтверждение и массовое действие — 440,
 * «Похоже, уже есть» с двумя превью — 720. `md` — промежуточная,
 * для диалогов с длинным телом (в макете такого нет, значение выведено).
 *
 * `panel` — не диалог, а панель на всё окно: R10 «Настройки». Ширины у неё
 * нет, панель тянется вместе с окном; поле по краям `--shell-pad`, сверху
 * `--shell-pad-top` (полоса светофора в окне macOS; в окне Windows — тот же
 * фолбэк 12, что в браузере: титлбар там системный, инсета нет), фон
 * `--color-panel`, шапка 60 и подвал 64 с линией от края до края.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'panel';

/** Ширины фиксированных размеров. У `panel` ширины нет — отсюда `Partial`. */
const SIZE_WIDTH: Partial<Record<ModalSize, number>> = { sm: 440, md: 560, lg: 720 };

export interface ModalContentProps
  extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Подвал с кнопками, прижат к низу. */
  footer?: ReactNode;
  /**
   * Линия над подвалом — от края до края, цветом обводки (правило Сергея).
   * По умолчанию есть только там, где у модалки есть прокручиваемое тело:
   * в подтверждениях R14 линии нет, и добавлять её незачем.
   */
  footerDivider?: boolean;
  size?: ModalSize;
  /** Ширина в px в обход `size` — на случай нестандартного диалога. */
  width?: number;
  /** Классы прокручиваемого тела: например, свой отступ снизу. */
  bodyClassName?: string;
}

export const ModalContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ModalContentProps>(
  function ModalContent(
    {
      title,
      description,
      footer,
      footerDivider,
      size = 'sm',
      width,
      className,
      bodyClassName,
      children,
      ...rest
    },
    ref,
  ) {
    const open = useContext(OpenContext);
    const reduced = useReducedMotion();
    /* Панель на всё окно живёт по метрикам R10, а не по метрикам диалога R14. */
    const isPanel = size === 'panel';
    const showDivider = footerDivider ?? (Boolean(footer) && Boolean(children));

    return (
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount key="modal">
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                {...scrimMotion()}
                className="fixed inset-0 z-40 bg-scrim backdrop-blur-[6px]"
              />
            </DialogPrimitive.Overlay>
            {/*
              Центрирование — сеткой, а не `translate(-50%, -50%)`: motion пишет
              собственный `transform`, и с трансформой из класса они дерутся —
              на входе и особенно на выходе модалка прыгала бы вбок.
              Обёртка прозрачна для мыши, чтобы клик мимо доходил до скрима.
            */}
            <div
              className={cn(
                'pointer-events-none fixed inset-0 z-50 grid',
                /*
                  Панель растягивается на всю ячейку; диалог стоит по центру.
                  Сверху у панели то же поле, что у оболочки (`--shell-pad-top`):
                  в окне macOS это 36, и заголовок «Настройки» больше не лезет под
                  кнопки светофора (замечание Сергея 03.09.2026). В окне Windows
                  титлбар системный — своей полосы светофора нет, и поле сверху
                  остаётся 12, как в браузере.

                  Зоной перетаскивания полоса не размечена нарочно: обёртка прозрачна
                  для мыши (`pointer-events-none`), а под ней скрим Radix, который на
                  нажатие закрывает панель. Окно и так тянется за шапку самой панели —
                  она размечена `deep` ниже.
                */
                isPanel
                  ? 'place-items-stretch p-[var(--shell-pad)] pt-[var(--shell-pad-top)]'
                  : 'place-items-center p-6',
              )}
            >
              <DialogPrimitive.Content ref={ref} asChild forceMount {...rest}>
                {/*
                  Колонка, а не один прокручиваемый блок: прокручивается тело, а
                  заголовок с крестиком и подвал с кнопками остаются на месте.
                  Зазор 16 между полосами — как в макете.
                */}
                <motion.div
                  {...modalMotion(reduced)}
                  style={isPanel ? undefined : { width: width ?? SIZE_WIDTH[size] }}
                  className={cn(
                    'pointer-events-auto flex flex-col text-ink outline-none',
                    isPanel
                      ? /* R10: панель во всё окно, без обводки и тени — она не парит над оболочкой. */
                        'h-full w-full overflow-hidden rounded-panel bg-panel'
                      : 'max-h-full w-full max-w-[calc(100vw-48px)] gap-4 rounded-panel border border-line-strong bg-raised p-6 shadow-modal',
                    className,
                  )}
                >
                  {/*
                    Шапка панели закрывает верхнюю панель оболочки вместе с её зоной
                    перетаскивания, поэтому несёт её сама (`deep` — тянуть можно за фон,
                    крестик внутри Tauri пропускает). Иначе окно с открытыми настройками
                    переставало двигаться — замечание Сергея 02.09.2026.
                  */}
                  <div
                    {...(isPanel ? { 'data-tauri-drag-region': 'deep' } : null)}
                    className={cn(
                      'flex shrink-0 gap-3',
                      isPanel ? 'h-[60px] items-center px-6' : 'items-start',
                    )}
                  >
                    <DialogPrimitive.Title
                      className={cn(
                        'min-w-0 flex-1 text-xl font-medium tracking-tight text-ink',
                        isPanel ? 'leading-6' : 'leading-[26px]',
                      )}
                    >
                      {title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Close
                      aria-label="Закрыть"
                      className={cn(
                        'shrink-0 text-ink-muted transition-colors duration-[var(--dur-fast)]',
                        'ease-out hover:text-ink focus-visible:text-ink',
                        isPanel
                          ? /* R10: крестик на подложке `--color-control`, 32×32. */
                            'flex size-8 items-center justify-center rounded-md bg-control hover:bg-control-hover'
                          : 'mt-[5px]',
                      )}
                    >
                      <Icon icon={X} size={16} aria-hidden />
                    </DialogPrimitive.Close>
                  </div>

                  {description ? (
                    <DialogPrimitive.Description className="shrink-0 text-md leading-5 text-ink-muted">
                      {description}
                    </DialogPrimitive.Description>
                  ) : null}

                  {children ? (
                    <div
                      className={cn(
                        'scrollbar-visible min-h-0 flex-1 overflow-y-auto',
                        isPanel && 'px-6 py-5',
                        bodyClassName,
                      )}
                    >
                      {children}
                    </div>
                  ) : null}

                  {/* Линия подвала вытянута полями наружу — идёт от края до края. */}
                  {showDivider ? (
                    <div className={cn('h-px shrink-0 bg-line-strong', !isPanel && '-mx-6')} />
                  ) : null}

                  {footer ? (
                    <div
                      className={cn(
                        'flex shrink-0 items-center justify-end gap-2',
                        isPanel && 'h-16 px-6',
                      )}
                    >
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);

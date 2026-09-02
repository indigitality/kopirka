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
import { useReducedMotion } from '@/lib/useReducedMotion';
import { overlayMotion, scrimMotion } from './motion-presets';
import { IconButton } from './IconButton';

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

/** Два размера: обычный диалог и широкий — настройки. */
export type ModalSize = 'sm' | 'lg';

const SIZE_WIDTH: Record<ModalSize, number> = { sm: 420, lg: 640 };

export interface ModalContentProps
  extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Подвал с кнопками, прижат к низу. */
  footer?: ReactNode;
  size?: ModalSize;
  /** Ширина в px в обход `size` — на случай нестандартного диалога. */
  width?: number;
  /** Классы прокручиваемого тела: например, свой отступ снизу. */
  bodyClassName?: string;
}

export const ModalContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ModalContentProps>(
  function ModalContent(
    { title, description, footer, size = 'sm', width, className, bodyClassName, children, ...rest },
    ref,
  ) {
    const open = useContext(OpenContext);
    const reduced = useReducedMotion();

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
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <DialogPrimitive.Content ref={ref} asChild forceMount {...rest}>
                {/*
                  Колонка, а не один прокручиваемый блок: прокручивается тело, а
                  заголовок с крестиком и подвал с кнопками остаются на месте.
                  Иначе в высокой модалке (настройки) заголовок уезжал бы вверх.
                  Внешние поля остались прежними — `py-5` на карточке и `px-5`
                  у каждой полосы дают ту же рамку 20px, что и прежний `p-5`.
                */}
                <motion.div
                  {...overlayMotion(reduced, 8)}
                  style={{ width: width ?? SIZE_WIDTH[size] }}
                  className={cn(
                    'pointer-events-auto flex max-h-full w-full max-w-[calc(100vw-48px)] flex-col',
                    'rounded-xl bg-surface-overlay py-5 text-ink shadow-float outline-none',
                    className,
                  )}
                >
                  <div className="flex shrink-0 items-start gap-3 px-5">
                    <div className="min-w-0 flex-1">
                      <DialogPrimitive.Title className="text-md font-medium text-ink">
                        {title}
                      </DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-1 text-base text-ink-muted">
                          {description}
                        </DialogPrimitive.Description>
                      ) : null}
                    </div>
                    <DialogPrimitive.Close asChild>
                      <IconButton label="Закрыть" className="-mt-1 -mr-1">
                        <X className="size-4" strokeWidth={2} aria-hidden />
                      </IconButton>
                    </DialogPrimitive.Close>
                  </div>

                  {children ? (
                    <div
                      className={cn(
                        'scrollbar-visible mt-4 min-h-0 flex-1 overflow-y-auto px-5',
                        bodyClassName,
                      )}
                    >
                      {children}
                    </div>
                  ) : null}
                  {footer ? (
                    <div className="mt-5 flex shrink-0 items-center justify-end gap-2 px-5">
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

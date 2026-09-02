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

export interface ModalContentProps
  extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Подвал с кнопками, прижат к низу. */
  footer?: ReactNode;
  width?: number;
}

export const ModalContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ModalContentProps>(
  function ModalContent({ title, description, footer, width = 420, className, children, ...rest }, ref) {
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
                <motion.div
                  {...overlayMotion(reduced, 8)}
                  style={{ width }}
                  className={cn(
                    'pointer-events-auto max-h-full w-full max-w-[calc(100vw-48px)] overflow-y-auto',
                    'rounded-xl bg-surface-overlay p-5 text-ink shadow-float outline-none',
                    className,
                  )}
                >
                  <div className="flex items-start gap-3">
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

                  {children ? <div className="mt-4">{children}</div> : null}
                  {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);

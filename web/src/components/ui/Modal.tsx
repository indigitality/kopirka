import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';
import { IconButton } from './IconButton';

export const Modal = DialogPrimitive.Root;
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
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT }}
            className="fixed inset-0 z-40 bg-scrim backdrop-blur-[6px]"
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content ref={ref} asChild {...rest}>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT }}
            style={{ width }}
            className={cn(
              'fixed top-1/2 left-1/2 z-50 max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2',
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
      </DialogPrimitive.Portal>
    );
  },
);

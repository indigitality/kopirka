import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { overlayMotion } from './motion-presets';

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

export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({ className, align = 'start', sideOffset = 6, children, ...rest }, ref) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <PopoverPrimitive.Portal forceMount key="popover">
          <PopoverPrimitive.Content
            ref={ref}
            forceMount
            align={align}
            sideOffset={sideOffset}
            asChild
            {...rest}
          >
            <motion.div
              {...overlayMotion(reduced)}
              className={cn(
                'z-50 min-w-[180px] rounded-md bg-surface-overlay p-1 text-base text-ink shadow-popover',
                'origin-[var(--radix-popover-content-transform-origin)] outline-none',
                className,
              )}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
});

/** Строка меню внутри поповера. */
export const PopoverItem = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(
  function PopoverItem({ className, type, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(
          'flex h-[var(--size-row)] w-full items-center gap-2 rounded-sm px-2 text-left text-base',
          'text-ink-muted transition-colors duration-[var(--dur-fast)] ease-out',
          'hover:bg-surface-hover hover:text-ink',
          'disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const PopoverSeparator = ({ className }: { className?: string }) => (
  <div className={cn('my-1 h-px bg-line', className)} />
);

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_BASE } from '@/lib/motion';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({ className, align = 'start', sideOffset = 6, children, ...rest }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} asChild {...rest}>
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: DUR_BASE, ease: EASE_OUT }}
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

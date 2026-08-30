import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(function ContextMenuContent({ className, children, ...rest }, ref) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content ref={ref} asChild {...rest}>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR_FAST, ease: EASE_OUT }}
          className={cn(
            'z-50 min-w-[196px] rounded-md bg-surface-overlay p-1 shadow-popover outline-none',
            'origin-[var(--radix-context-menu-content-transform-origin)]',
            className,
          )}
        >
          {children}
        </motion.div>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
});

export interface ContextMenuItemProps
  extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  /** Хоткей справа — моно, приглушённый. */
  hotkey?: string;
  danger?: boolean;
}

export const ContextMenuItem = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Item>,
  ContextMenuItemProps
>(function ContextMenuItem({ className, hotkey, danger, children, ...rest }, ref) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-[var(--size-row)] cursor-default items-center gap-2 rounded-sm px-2 text-base',
        'outline-none select-none transition-colors duration-[var(--dur-fast)] ease-out',
        danger
          ? 'text-danger data-[highlighted]:bg-danger-soft'
          : 'text-ink-muted data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      {...rest}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hotkey ? <span className="shrink-0 font-mono text-2xs opacity-60">{hotkey}</span> : null}
    </ContextMenuPrimitive.Item>
  );
});

export const ContextMenuSeparator = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...rest }, ref) {
  return (
    <ContextMenuPrimitive.Separator ref={ref} className={cn('my-1 h-px bg-line', className)} {...rest} />
  );
});

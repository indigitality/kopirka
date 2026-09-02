import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { DUR_FAST } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { layerMotion } from './motion-presets';

/**
 * Открыто ли меню. Radix наружу это не отдаёт, а без флага `AnimatePresence`
 * не сыграет уход: с `forceMount` контент живёт всегда.
 */
const OpenContext = createContext(false);

export type ContextMenuProps = ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Root>;

export function ContextMenu({ onOpenChange, children, ...rest }: ContextMenuProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  return (
    <ContextMenuPrimitive.Root onOpenChange={handleOpenChange} {...rest}>
      <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
    </ContextMenuPrimitive.Root>
  );
}

export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(function ContextMenuContent({ className, children, ...rest }, ref) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <ContextMenuPrimitive.Portal forceMount key="context-menu">
          <ContextMenuPrimitive.Content ref={ref} forceMount asChild {...rest}>
            <motion.div
              {...layerMotion({ scale: 0.97, enter: DUR_FAST, reduced })}
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
      ) : null}
    </AnimatePresence>
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

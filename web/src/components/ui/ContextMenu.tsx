/**
 * Контекстное меню — тот же стеклянный слой, что и поповер. Канон: R14 ·
 * «Меню и поповеры», образцы «карточка · правый клик» и «папка в сайдбаре».
 *
 * Тело — `.glass` + радиус `--radius-card` + `--shadow-popover`, поле 6.
 * Строка — общая с поповером (`GLASS_ROW`): 30 px, поля 10, текст 14/18 `ink`,
 * под курсором полупрозрачная подложка `--color-control`. Опасный пункт —
 * `danger` с подложкой `danger-tint`. Разделитель — от края до края,
 * цветом обводки контейнера (правило Сергея 02.09.2026).
 */
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
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion } from './motion-presets';
import { GLASS_LAYER, GLASS_ROW } from './Popover';

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
            {/* Меню всегда раскрывается от точки клика вниз — приезд сверху. */}
            <motion.div
              {...glassLayerMotion({ from: 'top', reduced })}
              className={cn(GLASS_LAYER, 'z-50 min-w-[210px] p-1.5', className)}
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
  /** Хоткей справа — 10 px, приглушённый. */
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
        GLASS_ROW,
        'cursor-default outline-none',
        danger
          ? 'text-danger data-[highlighted]:bg-danger-tint'
          : 'data-[highlighted]:bg-control',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      {...rest}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hotkey ? (
        <span className="shrink-0 text-2xs leading-3 font-normal text-ink-faint">{hotkey}</span>
      ) : null}
    </ContextMenuPrimitive.Item>
  );
});

export const ContextMenuSeparator = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...rest }, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn('-mx-1.5 my-1.5 h-px bg-line-strong', className)}
      {...rest}
    />
  );
});

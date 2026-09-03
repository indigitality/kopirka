/**
 * Тултип. Канон — R14 · «Тултипы»: маленькое стекло 24 px, радиус
 * `--radius-sm`, поля 8, зазор 6; текст 11/14 · 500 `ink`, хоткей 10/12
 * приглушённый. Тени у тултипа нет вовсе — только стекло и край.
 *
 * Появление — `glassLayerMotion` по стороне, куда его поставил Radix.
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
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { glassLayerMotion, sideToFrom } from './motion-presets';

export const TooltipProvider = ({ children, ...rest }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200} {...rest}>
    {children}
  </TooltipPrimitive.Provider>
);

/** Открыт ли тултип: с `forceMount` Radix сам этого не скажет, а уход без флага не сыграть. */
const OpenContext = createContext(false);

export type TooltipRootProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

export function TooltipRoot({ open, defaultOpen, onOpenChange, children, ...rest }: TooltipRootProps) {
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
    <TooltipPrimitive.Root open={isOpen} onOpenChange={handleOpenChange} {...rest}>
      <OpenContext.Provider value={isOpen}>{children}</OpenContext.Provider>
    </TooltipPrimitive.Root>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, side = 'bottom', sideOffset = 6, children, ...rest }, ref) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <TooltipPrimitive.Portal forceMount key="tooltip">
          <TooltipPrimitive.Content
            ref={ref}
            forceMount
            side={side}
            sideOffset={sideOffset}
            asChild
            {...rest}
          >
            <motion.div
              {...glassLayerMotion({ from: sideToFrom(side), reduced })}
              className={cn(
                'glass z-50 flex h-[var(--size-tooltip)] items-center gap-1.5 rounded-sm px-2',
                'text-xs leading-[14px] font-medium text-ink select-none whitespace-nowrap',
                className,
              )}
            >
              {children}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
});

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  /** Хоткей справа от текста — 10 px, приглушённый. */
  hotkey?: string;
}

/** Готовая обёртка на один триггер. Для сложных случаев — примитивы выше. */
export function Tooltip({ content, children, side = 'bottom', hotkey }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        {content}
        {hotkey ? (
          <span className="text-2xs leading-3 font-normal text-ink-faint">{hotkey}</span>
        ) : null}
      </TooltipContent>
    </TooltipRoot>
  );
}

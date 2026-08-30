import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { EASE_OUT, DUR_FAST } from '@/lib/motion';

export const TooltipProvider = ({ children, ...rest }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200} {...rest}>
    {children}
  </TooltipPrimitive.Provider>
);

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, children, ...rest }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} asChild {...rest}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: DUR_FAST, ease: EASE_OUT }}
          className={cn(
            'z-50 rounded-sm bg-surface-overlay px-2 py-1 text-sm text-ink shadow-popover',
            'select-none whitespace-nowrap',
            className,
          )}
        >
          {children}
        </motion.div>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  /** Хоткей справа от текста — моно, приглушённый. */
  hotkey?: string;
}

/** Готовая обёртка на один триггер. Для сложных случаев — примитивы выше. */
export function Tooltip({ content, children, side = 'bottom', hotkey }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="flex items-center gap-2">
          {content}
          {hotkey ? <span className="font-mono text-2xs text-ink-faint">{hotkey}</span> : null}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
}

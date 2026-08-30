/**
 * Единые параметры движения. Значения продублированы из токенов
 * (--ease-out, --dur-fast/base), потому что motion принимает числа, а не CSS-переменные.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DUR_FAST = 0.12;
export const DUR_BASE = 0.2;
export const DUR_SLOW = 0.32;

/** Появление поповера/меню: короткий подъём с лёгким масштабом. */
export const popTransition = { duration: DUR_BASE, ease: EASE_OUT } as const;

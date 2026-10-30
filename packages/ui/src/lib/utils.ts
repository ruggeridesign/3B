import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind resolviendo conflictos.
 * Permite pasar clases condicionales y sobreescribir utilidades
 * sin duplicados (ej: `cn('px-2', condition && 'px-4')` -> `px-4`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

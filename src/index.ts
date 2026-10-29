// ─────────────────────────────────────────────────────────────
// Punto de entrada público del design system de 3B
// ─────────────────────────────────────────────────────────────
// Re-exportá acá cada componente para que sea consumible desde la
// app. Mantené este archivo como la "API pública" del paquete.

// Utilidades
export { cn } from './lib/utils';

// Componentes (base shadcn/ui — personalizados para 3B)
export * from './components/ui/button';
export * from './components/ui/input';
export * from './components/ui/card';
export * from './components/ui/label';

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** Una línea del carrito (cliente): variante + datos congelados para mostrar. */
export interface CartLine {
  variantId: string;
  itemId: string;
  storeId: string;
  storeName: string;
  title: string;
  sku: string | null;
  unitPrice: string; // "49.90"
  currency: string; // "USD"
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  add: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clearStore: (storeId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const KEY = '3b.cart.v1';

/**
 * Carrito **del cliente** (multitienda), persistido en `localStorage`. En el
 * checkout, cada tienda se envía como un pedido aparte. No vive en el backend:
 * el modelo de datos no tiene tabla de carrito (es efímero del comprador).
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage una vez (evita desajustes de SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      // storage no disponible o JSON inválido: carrito vacío.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      // sin persistencia (modo privado, etc.): seguimos en memoria.
    }
  }, [lines, hydrated]);

  const add = useCallback<CartContextValue['add']>((line, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === line.variantId);
      if (i === -1) return [...prev, { ...line, qty }];
      const next = [...prev];
      const existing = next[i] as CartLine;
      next[i] = { ...existing, qty: existing.qty + qty };
      return next;
    });
  }, []);

  const setQty = useCallback<CartContextValue['setQty']>((variantId, qty) => {
    setLines((prev) =>
      prev
        .map((l) => (l.variantId === variantId ? { ...l, qty } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const remove = useCallback<CartContextValue['remove']>((variantId) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const clearStore = useCallback<CartContextValue['clearStore']>((storeId) => {
    setLines((prev) => prev.filter((l) => l.storeId !== storeId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      add,
      setQty,
      remove,
      clearStore,
      clear,
    }),
    [lines, add, setQty, remove, clearStore, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Acceso al carrito. Debe usarse dentro de `<CartProvider>`. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}

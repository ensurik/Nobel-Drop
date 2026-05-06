// Klient-side kurv. Lokalt minne; faktisk reservasjon skjer i create-order.
import { createContext, useContext, useReducer, ReactNode } from "react";
import type { DropItem } from "@nobel/types";

export interface CartLine {
  drop_item_id: string;
  product_id: string;
  name: string;
  unit_price_ore: number;
  quantity: number;
  role: "hero" | "addon" | "order_lifter";
}

interface CartState {
  drop_id: string | null;
  lines: CartLine[];
}

type Action =
  | { type: "ADD"; drop_id: string; line: CartLine }
  | { type: "REMOVE"; drop_item_id: string }
  | { type: "SET_QTY"; drop_item_id: string; quantity: number }
  | { type: "CLEAR" };

const initial: CartState = { drop_id: null, lines: [] };

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "ADD": {
      // Hvis kurven har et annet drop, nullstill først
      if (state.drop_id && state.drop_id !== action.drop_id) {
        return { drop_id: action.drop_id, lines: [action.line] };
      }
      const existing = state.lines.find((l) => l.drop_item_id === action.line.drop_item_id);
      const lines = existing
        ? state.lines.map((l) =>
            l.drop_item_id === action.line.drop_item_id
              ? { ...l, quantity: l.quantity + action.line.quantity }
              : l,
          )
        : [...state.lines, action.line];
      return { drop_id: action.drop_id, lines };
    }
    case "REMOVE":
      return {
        ...state,
        lines: state.lines.filter((l) => l.drop_item_id !== action.drop_item_id),
      };
    case "SET_QTY":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.drop_item_id === action.drop_item_id ? { ...l, quantity: action.quantity } : l,
        ),
      };
    case "CLEAR":
      return initial;
  }
}

interface CartContextValue extends CartState {
  add: (drop_id: string, dropItem: DropItem & { products?: { name: string } }, qty?: number) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  totalOre: number;
  totalQty: number;
  hasHero: boolean;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const totalOre = state.lines.reduce((sum, l) => sum + l.unit_price_ore * l.quantity, 0);
  const totalQty = state.lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasHero = state.lines.some((l) => l.role === "hero");

  const value: CartContextValue = {
    ...state,
    totalOre,
    totalQty,
    hasHero,
    add: (drop_id, dropItem, qty = 1) =>
      dispatch({
        type: "ADD",
        drop_id,
        line: {
          drop_item_id: dropItem.id,
          product_id: dropItem.product_id,
          name: dropItem.products?.name ?? "Produkt",
          unit_price_ore: dropItem.price_ore,
          quantity: qty,
          role: dropItem.role,
        },
      }),
    remove: (id) => dispatch({ type: "REMOVE", drop_item_id: id }),
    setQty: (id, qty) => dispatch({ type: "SET_QTY", drop_item_id: id, quantity: qty }),
    clear: () => dispatch({ type: "CLEAR" }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart må brukes innenfor <CartProvider>");
  return ctx;
}

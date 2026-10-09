// Toast global. `toast()` bisa dipanggil dari luar React (mis. onError mutation).
import { create } from "zustand";

export type ToastKind = "ok" | "error" | "pending" | "info";
export interface Toast { id: number; kind: ToastKind; text: string; action?: { label: string; run(): void } }

interface ToastState { items: Toast[]; dismiss(id: number): void }

let seq = 0;
export const useToasts = create<ToastState>((set) => ({
  items: [],
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Kembalikan id; toast pending tidak hilang sendiri, panggil dismiss(id). */
export function toast(kind: ToastKind, text: string, action?: Toast["action"]): number {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, kind, text, action }] }));
  if (kind !== "pending") setTimeout(() => useToasts.getState().dismiss(id), kind === "error" ? 7000 : 4000);
  return id;
}
export const dismissToast = (id: number) => useToasts.getState().dismiss(id);

// Teks UI. Sumber utama COPY (sot/copy.en.json lewat @movemarket/shared).
import { COPY } from "@movemarket/shared";

export { COPY };

/** Label struktural layar (sot/copy.en.json bagian `ui`). */
export const UI = COPY.ui;

/** "Any check in {range}?" + { range } -> teks terisi. */
export function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

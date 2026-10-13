// Pilih papan 3D (lazy, three.js di chunk sendiri) atau 2D. Jatuh ke 2D kalau WebGL tidak ada, chunk gagal
// dimuat, atau renderer gagal dibuat. Juga preferensi 2D/3D layar partai (localStorage) dan tombolnya.
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { UI } from "../common/copy.ts";
import type { Board3DProps } from "./Board3D.tsx";

let support: boolean | undefined;
/** Batas modul untuk test (happy-dom tidak punya WebGL). */
export const webgl = {
  supported(): boolean {
    if (support === undefined) {
      try {
        const c = document.createElement("canvas");
        support = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
      } catch {
        support = false;
      }
    }
    return support;
  },
};

const Board3D = lazy(() => import("./Board3D.tsx"));

class Fallback extends Component<{ flat: ReactNode; onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? this.props.flat : this.props.children; }
}

/** `flat`: papan 2D yang tampil saat 3D tidak dipakai, sedang dimuat, atau gagal. */
export function BoardSurface({ view, flat, ...props }: Omit<Board3DProps, "onFail"> & { view: BoardView; flat: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (view === "2d" || failed || !webgl.supported()) return flat;
  return (
    <Fallback flat={flat} onError={() => setFailed(true)}>
      <Suspense fallback={flat}>
        <Board3D {...props} onFail={() => setFailed(true)} />
      </Suspense>
    </Fallback>
  );
}

export type BoardView = "2d" | "3d";
const KEY = "movemarket.boardView";

/** Preferensi papan layar partai. Default 2D sesuai prototipe (view3d: false); disimpan per perangkat. */
export function useBoardView(): [BoardView, (v: BoardView) => void] {
  const [view, setView] = useState<BoardView>(() => {
    try { return localStorage.getItem(KEY) === "3d" ? "3d" : "2d"; } catch { return "2d"; }
  });
  return [view, (v) => {
    setView(v);
    try { localStorage.setItem(KEY, v); } catch { /* storage diblokir: preferensi hanya untuk sesi ini */ }
  }];
}

/** Tombol 2D/3D; tidak tampil kalau WebGL tidak tersedia. */
export function BoardViewToggle({ view, onChange }: { view: BoardView; onChange(v: BoardView): void }) {
  if (!webgl.supported()) return null;
  const seg = (v: BoardView, label: string) => (
    <button type="button" className="seg" aria-pressed={view === v} onClick={() => onChange(v)}>{label}</button>
  );
  return (
    <div role="group" aria-label={UI.board.view} className="inline-flex gap-0.5 self-start rounded-control bg-deep p-[3px]">
      {seg("2d", UI.board.flat)}
      {seg("3d", UI.board.solid)}
    </div>
  );
}

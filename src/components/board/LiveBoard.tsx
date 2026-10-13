// Papan tampilan saja (FRONTEND.md bagian 8). Sorot langkah terakhir, nomor ply dan langkah di bawah papan.
// view "3d": papan three.js (lazy) di bingkai yang sama, jatuh ke 2D kalau WebGL tidak tersedia.
import { moveNumber } from "@movemarket/shared";
import { Chessboard } from "react-chessboard";
import type { CSSProperties, ReactNode } from "react";
import type { LiveBoardProps } from "../../contracts/ui.ts";
import { COPY, UI, fill } from "../common/copy.ts";
import { BoardSurface, type BoardView } from "./BoardSurface.tsx";

const isDark = (sq: string) => (sq.charCodeAt(0) - 97 + Number(sq[1])) % 2 === 1;
const last = (sq: string): CSSProperties => ({ backgroundColor: isDark(sq) ? "var(--color-board-last-dark)" : "var(--color-board-last-light)" });
const notation: CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 11 };
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function boardLabel(ply: number, lastSan?: string) {
  const pos = fill(UI.game.plyMove, { ply, move: moveNumber(ply) });
  return lastSan ? `${pos}, ${fill(UI.game.lastMove, { san: lastSan })}` : pos;
}

const SLIDE_MS = 420;

/** Papan 2D. Bidak meluncur dari petak asal, lalu "mendarat" (mm-land: membesar dengan bayangan, turun) di petak tujuan. */
export function FlatBoard({ fen, lastMove, ply, label, id }: { fen: string; lastMove?: { from: string; to: string }; ply: number; label: string; id?: string }) {
  const squareStyles = lastMove ? { [lastMove.from]: last(lastMove.from), [lastMove.to]: last(lastMove.to) } : {};
  const reduce = reducedMotion();
  return (
    <div role="img" aria-label={label} className="overflow-hidden rounded-control">
      {/* Papan hanya tampilan: bidak react-chessboard berupa div role=button tabindex=0; inert menghapusnya dari urutan fokus. */}
      <div inert>
        <Chessboard
          options={{
            id,
            position: fen,
            allowDragging: false,
            allowDrawingArrows: false,
            showAnimations: !reduce,
            animationDurationInMs: SLIDE_MS,
            squareStyles,
            squareRenderer: ({ square, children }) => (
              <div style={{ width: "100%", height: "100%", ...squareStyles[square] }}>
                {lastMove && !reduce && square === lastMove.to
                  ? <div key={ply} className="mm-land h-full w-full" style={{ animationDelay: `${SLIDE_MS}ms` }}>{children}</div>
                  : children}
              </div>
            ),
            darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
            lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
            darkSquareNotationStyle: { ...notation, color: "var(--color-board-light)" },
            lightSquareNotationStyle: { ...notation, color: "var(--color-board-dark)" },
          }}
        />
      </div>
    </div>
  );
}

/**
 * `label` (opsional, di luar kontrak): teks aksesibel papan, mis. langkah terakhir. `children`: overlay (mis. papan dijeda).
 * `aside`: elemen setinggi papan di sisi kanan (pool bar vertikal). `view`/`lastSan`: papan 3D dan labelnya.
 */
export function LiveBoard({ fen, lastMove, ply, isReplay, label, children, aside, view = "2d", lastSan }: LiveBoardProps & {
  label?: string; children?: ReactNode; aside?: ReactNode; view?: BoardView; lastSan?: string;
}) {
  const flat = <FlatBoard fen={fen} lastMove={lastMove} ply={ply} label={label ?? boardLabel(ply)} />;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="flex gap-2">
        <div className={`relative min-w-0 flex-auto overflow-hidden rounded-control ${view === "3d" ? "aspect-square bg-deep" : ""}`}>
          <BoardSurface
            view={view} flat={flat} fen={fen} ply={ply} lastMove={lastMove} controls
            label={fill(UI.board.label3d, { ply, last: lastSan ? `${fill(UI.game.lastMove, { san: lastSan })}.` : "" })}
            scene={{ dist: 25, offset: [0.03, -0.02], offsetNarrow: [0.03, -0.02], elev: 0.7 }}
          />
          {children}
        </div>
        {aside}
      </div>
      <figcaption className="flex items-center justify-between text-sm text-soft">
        <span>{fill(UI.game.plyMove, { ply, move: moveNumber(ply) })}</span>
        {isReplay && <span className="tag bg-muted text-[13px] tracking-[0.06em] text-ink">{COPY.market.replayBadge}</span>}
      </figcaption>
    </figure>
  );
}

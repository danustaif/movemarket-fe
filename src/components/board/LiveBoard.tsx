// Papan tampilan saja (FRONTEND.md bagian 8). Sorot langkah terakhir, nomor ply dan langkah di bawah papan.
import { moveNumber } from "@movemarket/shared";
import { Chessboard } from "react-chessboard";
import type { CSSProperties, ReactNode } from "react";
import type { LiveBoardProps } from "../../contracts/ui.ts";
import { COPY, UI, fill } from "../common/copy.ts";

const isDark = (sq: string) => (sq.charCodeAt(0) - 97 + Number(sq[1])) % 2 === 1;
const last = (sq: string): CSSProperties => ({ backgroundColor: isDark(sq) ? "var(--color-board-last-dark)" : "var(--color-board-last-light)" });
const notation: CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 11 };

/** `label` (opsional, di luar kontrak): teks aksesibel papan, mis. langkah terakhir. `children`: overlay (mis. papan dijeda). */
export function LiveBoard({ fen, lastMove, ply, isReplay, label, children }: LiveBoardProps & { label?: string; children?: ReactNode }) {
  const squareStyles = lastMove ? { [lastMove.from]: last(lastMove.from), [lastMove.to]: last(lastMove.to) } : {};
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-control" role="img" aria-label={label ?? fill(UI.game.plyMove, { ply, move: moveNumber(ply) })}>
        <Chessboard
          options={{
            position: fen,
            allowDragging: false,
            allowDrawingArrows: false,
            animationDurationInMs: 220,
            squareStyles,
            darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
            lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
            darkSquareNotationStyle: { ...notation, color: "var(--color-board-light)" },
            lightSquareNotationStyle: { ...notation, color: "var(--color-board-dark)" },
          }}
        />
        {children}
      </div>
      <figcaption className="flex items-center justify-between text-sm text-soft">
        <span>{fill(UI.game.plyMove, { ply, move: moveNumber(ply) })}</span>
        {isReplay && <span className="tag bg-muted text-[13px] tracking-[0.06em] text-ink">{COPY.market.replayBadge}</span>}
      </figcaption>
    </figure>
  );
}

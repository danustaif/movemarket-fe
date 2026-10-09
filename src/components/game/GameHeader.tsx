// Baris judul partai dan kartu pemain (DESIGN.md "Mobile game": bar pemain menempel di atas dan bawah papan).
import { COPY, type GameSummary, type Player } from "@movemarket/shared";
import { UI, fill } from "../common/copy.ts";

export function SourceTag({ isReplay }: { isReplay: boolean }) {
  return isReplay
    ? <span className="tag bg-muted text-[13px] tracking-[0.06em] text-ink">{COPY.market.replayBadge}</span>
    : <span className="tag bg-live text-[13px] tracking-[0.06em] text-white">{COPY.market.liveBadge}</span>;
}

const vs = (g: GameSummary) => fill(UI.game.versus, { white: g.white.name, black: g.black.name });

export function GameHeader({ game }: { game: GameSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <SourceTag isReplay={game.isReplay} />
      <h1 className="display m-0 min-w-0 text-[28px] break-words sm:text-[40px]">{vs(game)}</h1>
    </div>
  );
}

/** Kartu pemain. `toMove` memberi cincin gold 2px (DESIGN.md: pemain aktif). */
export function PlayerBar({ player, white, toMove }: { player: Player; white: boolean; toMove: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-control bg-panel px-3 py-2 ${toMove ? "shadow-[inset_0_0_0_2px_var(--color-gold)]" : ""}`}>
      <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-tag ${white ? "bg-piece-white" : "bg-piece-black shadow-[inset_0_0_0_1px_var(--color-piece-edge)]"}`} />
      <b className="min-w-0 truncate">{player.name}</b>
      {player.rating !== undefined && <span className="text-sm text-muted">{player.rating}</span>}
    </div>
  );
}

export { vs as gameTitle };

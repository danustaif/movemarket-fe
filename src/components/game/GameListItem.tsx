// Baris partai di beranda: papan mini + pemain + ply + jumlah pasar terbuka.
import { moveNumber, type GameSummary } from "@movemarket/shared";
import { Link } from "@tanstack/react-router";
import { Chessboard } from "react-chessboard";
import { UI, fill } from "../common/copy.ts";
import { SourceTag, gameTitle } from "./GameHeader.tsx";

export function GameListItem({ game }: { game: GameSummary }) {
  return (
    <article aria-label={gameTitle(game)} className="flex overflow-hidden rounded-panel bg-panel">
      <Link
        to="/game/$gameRef" params={{ gameRef: game.gameRef }} tabIndex={-1} aria-hidden="true"
        className="block w-[120px] flex-none self-start bg-deep sm:w-[220px]"
      >
        {/* inert: bidak react-chessboard fokusabel (tabindex=0) walau di dalam link aria-hidden. Klik tetap jatuh ke link. */}
        <div inert>
          <Chessboard
            options={{
              id: `mini-${game.gameRef}`, position: game.fen, allowDragging: false, showNotation: false, showAnimations: false,
              darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
              lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
            }}
          />
        </div>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <SourceTag isReplay={game.isReplay} />
          {game.openMarkets > 0 && !game.ended && (
            <span className="text-sm font-bold text-gold">{fill(UI.home.openMarkets, { n: game.openMarkets })}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 sm:text-[17px]">
          <span className="truncate"><b>{game.white.name}</b> <span className="text-muted">{game.white.rating}</span></span>
          <span className="truncate"><b>{game.black.name}</b> <span className="text-muted">{game.black.rating}</span></span>
        </div>
        <span className="text-sm text-soft sm:text-base">
          {game.ended && game.result ? fill(UI.home.finished, { result: game.result }) : fill(UI.game.plyMove, { ply: game.ply, move: moveNumber(game.ply) })}
        </span>
        <div className="mt-auto">
          <Link to="/game/$gameRef" params={{ gameRef: game.gameRef }} className={`btn sm sm:min-h-12 sm:text-base ${game.ended ? "ghost" : "gold"}`}>
            {UI.home.watch}
          </Link>
        </div>
      </div>
    </article>
  );
}

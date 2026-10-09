// Layar partai: papan di atas (mobile) atau kiri (desktop), pasar Open / In play / Results, lembar stake.
import { SOT, moveNumber } from "@movemarket/shared";
import { Link, createRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { lastMove } from "../components/board/lastMove.ts";
import { LiveBoard } from "../components/board/LiveBoard.tsx";
import { COPY, UI, fill } from "../components/common/copy.ts";
import { ErrorBox, Skeleton } from "../components/common/States.tsx";
import { useNowSec } from "../components/common/useNowSec.ts";
import { GameHeader, PlayerBar } from "../components/game/GameHeader.tsx";
import { BetPanel } from "../components/market/BetPanel.tsx";
import { Countdown } from "../components/market/Countdown.tsx";
import { MarketCard } from "../components/market/MarketCard.tsx";
import { OutcomeBadge } from "../components/market/OutcomeBadge.tsx";
import type { Market, MarketPhase, Position } from "../contracts/data.ts";
import { deriveMarketPhase, IN_PLAY, isClosingSoon, SETTLED } from "../lib/marketPhase.ts";
import { ResolverError } from "../lib/resolver.ts";
import { gameQuery } from "../queries/index.ts";
import { rootRoute } from "./__root.tsx";
import { useAccountView, useBet, useChainOffset, useGame, useGetTokens, usePositions } from "./-wiring.ts";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameRef",
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(gameQuery(params.gameRef))
      .catch(() => undefined),
  component: GamePage,
});

const MAX_STAKE = BigInt(SOT.contract.defaults.maxStakePerUser);
const FEE_BPS = SOT.contract.defaults.feeBps;

type Row = { market: Market; phase: MarketPhase; position?: Position };

function Section({ id, title, count, empty, children }: { id: string; title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="display m-0 text-[26px]">
        {title} <span className="text-muted">{count}</span>
      </h2>
      {count === 0 ? <span className="text-[15px] text-muted">{empty}</span> : children}
    </section>
  );
}

function GamePage() {
  const { gameRef } = gameRoute.useParams();
  const game = useGame(gameRef);
  const now = useNowSec(useChainOffset());
  const acct = useAccountView();
  const positions = usePositions(acct.address);
  const [pick, setPick] = useState<{ id: bigint; yes: boolean } | null>(null);

  // FEN sebelumnya untuk sorotan langkah terakhir (state disesuaikan saat render, tanpa effect).
  const fen = game.data?.game.fen;
  const [fens, setFens] = useState<{ cur?: string; prev?: string }>({ cur: fen });
  if (fen !== fens.cur) setFens({ cur: fen, prev: fens.cur });
  // Strip ply terakhir digulir ke langkah terbaru setiap ada langkah baru.
  const stripRef = useRef<HTMLOListElement>(null);
  useEffect(() => { stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth }); }, [fen]);

  if (game.isPending) {
    return <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_1fr]"><Skeleton className="aspect-square" /><Skeleton className="h-[320px]" /></div>;
  }
  if (!game.data) {
    const notFound = game.error instanceof ResolverError && game.error.status === 404;
    return (
      <ErrorBox action={notFound
        ? <Link to="/" className="btn gold sm">{UI.game.back}</Link>
        : <button type="button" className="btn gold sm" onClick={() => game.refetch()}>{COPY.actions.retry}</button>}>
        {notFound ? UI.game.notFound : COPY.errors.RESOLVER_OFFLINE}
      </ErrorBox>
    );
  }

  const g = game.data.game;
  const mine = new Map((positions ?? []).filter((p) => p.gameRef === gameRef).map((p) => [p.marketId, p]));
  const rows: Row[] = game.data.markets.map((m) => ({ market: m, phase: deriveMarketPhase(m, g.ply, now), position: mine.get(m.id) }));
  const open = rows.filter((r) => r.phase.phase === "open").sort((a, b) => a.market.lockTime - b.market.lockTime);
  const inPlay = rows.filter((r) => IN_PLAY.has(r.phase.phase)).sort((a, b) => a.market.fromPly - b.market.fromPly);
  const done = rows.filter((r) => SETTLED.has(r.phase.phase)).sort((a, b) => b.market.toPly - a.market.toPly);
  const whiteToMove = g.ply % 2 === 0;
  const lastSan = g.sans.at(-1);
  const recent = g.sans.slice(-8).map((san, i, a) => ({ san, ply: g.ply - a.length + 1 + i }));
  const picked = pick ? rows.find((r) => r.market.id === pick.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <GameHeader game={g} />

      {g.ended && (
        <div role="status" className="rounded-panel bg-white px-4 py-3.5 text-ink">
          <b className="display text-[26px]">{fill(UI.home.finished, { result: g.result ?? "" })}</b>
        </div>
      )}

      {/* Desktop: papan menempel saat daftar pasar digulir; lebarnya dibatasi tinggi layar supaya bar pemain ikut terlihat. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,min(640px,calc(100vh-300px)))_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-[76px]">
          <PlayerBar player={g.black} white={false} toMove={!g.ended && !whiteToMove} />
          <LiveBoard
            fen={g.fen} ply={g.ply} isReplay={g.isReplay}
            lastMove={lastMove(fens.prev, g.fen, lastSan, g.ply)}
            label={lastSan ? `${fill(UI.game.plyMove, { ply: g.ply, move: moveNumber(g.ply) })}, ${fill(UI.game.lastMove, { san: lastSan })}` : undefined}
          />
          <PlayerBar player={g.white} white toMove={!g.ended && whiteToMove} />
          {recent.length > 0 && (
            <ol aria-label={fill(UI.game.lastMove, { san: lastSan ?? "" })} className="m-0 flex list-none gap-1 overflow-x-auto p-0" ref={stripRef}>
              {recent.map((m, i) => (
                <li key={m.ply} className={`flex flex-none flex-col rounded-[3px] px-2.5 py-1.5 text-sm ${i === recent.length - 1 ? "bg-gold text-ink" : "bg-deep text-white"}`}>
                  <span className="text-[11px] font-bold opacity-75">{m.ply}</span>
                  <b>{m.san}</b>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="mo-h" title={UI.game.openNow} count={open.length} empty={g.ended ? fill(UI.home.finished, { result: g.result ?? "" }) : UI.game.noOpen}>
            {open.map((r) => (
              <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} onPick={(yes) => setPick({ id: r.market.id, yes })} />
            ))}
          </Section>
          <Section id="mp-h" title={UI.game.inPlay} count={inPlay.length} empty={UI.game.noInPlay}>
            {inPlay.map((r) => <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} />)}
          </Section>
          <Section id="mr-h" title={UI.game.results} count={done.length} empty={UI.game.noResults}>
            {done.map((r) => <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} />)}
          </Section>
        </div>
      </div>

      {pick && picked && (
        <StakeSheet row={picked} initialYes={pick.yes} now={now} gameRef={gameRef} onClose={() => setPick(null)} />
      )}
    </div>
  );
}

function StakeSheet({ row, initialYes, now, gameRef, onClose }: { row: Row; initialYes: boolean; now: number; gameRef: string; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const acct = useAccountView();
  const bet = useBet();
  const getTokens = useGetTokens();
  const { market, phase, position } = row;
  const staked = position ? position.stakeYes + position.stakeNo : 0n;

  // Tanpa cleanup close(): di StrictMode close() memicu onClose dan langsung menutup lembar. Unmount sudah melepas dialog.
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  return (
    <dialog ref={ref} className="sheet pop" aria-labelledby="sk-h" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="flex items-center gap-2.5 pt-3 pr-3 pl-4.5">
        {phase.phase === "open"
          ? <span className={`tag ${isClosingSoon(phase.secondsLeft) ? "bg-coral" : "bg-gold"} text-ink`}><Countdown lockTime={market.lockTime} nowSec={now} /></span>
          : <OutcomeBadge phase={phase} />}
        <button type="button" className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-control border-0 bg-transparent text-ink hover:bg-wash" onClick={() => ref.current?.close()} aria-label={UI.stake.close}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="flex flex-col gap-3.5 px-4.5 pt-1.5 pb-4.5">
        <h2 id="sk-h" className="m-0 text-[22px] leading-tight font-extrabold">{market.question}</h2>
        {phase.phase === "open" ? (
          <BetPanel
            market={market} remainingCap={MAX_STAKE - staked} account={acct.status} pending={bet.isPending}
            initialYes={initialYes} balance={acct.balance} feeBps={FEE_BPS}
            onUnlock={acct.unlock} unlocking={acct.unlocking} onGetTokens={getTokens}
            onStake={(yes, amount) => bet.mutate({ gameRef, marketId: market.id, yes, amount }, { onSuccess: () => ref.current?.close() })}
          />
        ) : (
          <p role="alert" className="m-0 rounded-control bg-err-wash px-3.5 py-3 font-bold text-err-ink">{COPY.errors.BettingClosed}</p>
        )}
      </div>
    </dialog>
  );
}

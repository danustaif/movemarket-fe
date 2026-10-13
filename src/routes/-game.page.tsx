// Komponen route gameRoute (dimuat lazy lewat lazyRouteComponent).
import { SOT } from "@movemarket/shared";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BoardViewToggle, useBoardView } from "../components/board/BoardSurface.tsx";
import { boardLabel, LiveBoard } from "../components/board/LiveBoard.tsx";
import { useLastMove } from "../components/board/useLastMove.ts";
import { COPY, UI, fill } from "../components/common/copy.ts";
import { ErrorBox, Skeleton } from "../components/common/States.tsx";
import { useNowSec } from "../components/common/useNowSec.ts";
import { GameHeader, PlayerBar } from "../components/game/GameHeader.tsx";
import { LowerThird } from "../components/market/LowerThird.tsx";
import { MarketCard, VerticalPoolBar } from "../components/market/MarketCard.tsx";
import { MarketDetail } from "../components/market/MarketDetail.tsx";
import { StakeSheet, type Row } from "../components/market/StakeSheet.tsx";
import { deriveMarketPhase, IN_PLAY, SETTLED } from "../lib/marketPhase.ts";
import { ResolverError } from "../lib/resolver.ts";
import { useAccountView, useChainOffset, useGame, usePositions } from "./-wiring.ts";

import { gameRoute } from "./game.$gameRef.tsx";

const FEE_BPS = SOT.contract.defaults.feeBps;

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

export function GamePage() {
  const { gameRef } = gameRoute.useParams();
  const game = useGame(gameRef);
  const now = useNowSec(useChainOffset());
  const acct = useAccountView();
  const positions = usePositions(acct.address);
  const [pick, setPick] = useState<{ id: bigint; yes: boolean } | null>(null);
  const [detailId, setDetailId] = useState<bigint | null>(null);
  const [view, setView] = useBoardView();

  const fen = game.data?.game.fen;
  const move = useLastMove(fen, game.data?.game.sans.at(-1), game.data?.game.ply ?? 0);
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
        ? <Link to="/games" className="btn gold sm">{UI.game.back}</Link>
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
  const detail = detailId === null ? undefined : rows.find((r) => r.market.id === detailId);
  // Pasar yang paling cepat terkunci menjadi lower third; sisanya tetap di daftar Open now.
  const [pinned, ...restOpen] = open;

  return (
    <div className="flex flex-col gap-4">
      <GameHeader game={g} />

      {g.ended && (
        <div role="status" className="rounded-panel bg-white px-4 py-3.5 text-ink">
          <b className="display text-[26px]">{fill(UI.home.finished, { result: g.result ?? "" })}</b>
        </div>
      )}

      {/* Desktop: papan menempel saat daftar pasar digulir; lebarnya dibatasi tinggi layar supaya bar pemain tetap terlihat di atas lower third. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,min(640px,calc(100vh-400px)))_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-[76px]">
          <PlayerBar player={g.black} white={false} toMove={!g.ended && !whiteToMove} />
          <LiveBoard
            fen={g.fen} ply={g.ply} isReplay={g.isReplay} view={view} lastSan={lastSan}
            lastMove={move}
            aside={<VerticalPoolBar poolYes={pinned?.market.poolYes ?? 0n} poolNo={pinned?.market.poolNo ?? 0n} />}
            label={boardLabel(g.ply, lastSan)}
          />
          <PlayerBar player={g.white} white toMove={!g.ended && whiteToMove} />
          <BoardViewToggle view={view} onChange={setView} />
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
            {restOpen.map((r) => (
              <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} onPick={(yes) => setPick({ id: r.market.id, yes })} />
            ))}
          </Section>
          <Section id="mp-h" title={UI.game.inPlay} count={inPlay.length} empty={UI.game.noInPlay}>
            {inPlay.map((r) => <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} onDetails={() => setDetailId(r.market.id)} />)}
          </Section>
          <Section id="mr-h" title={UI.game.results} count={done.length} empty={UI.game.noResults}>
            {done.map((r) => <MarketCard key={String(r.market.id)} {...r} feeBps={FEE_BPS} onDetails={() => setDetailId(r.market.id)} />)}
          </Section>
        </div>
      </div>

      {pinned && (
        <LowerThird
          market={pinned.market} nowSec={now} position={pinned.position} feeBps={FEE_BPS}
          onPick={(yes) => setPick({ id: pinned.market.id, yes })}
        />
      )}

      {detail && <MarketDetail {...detail} feeBps={FEE_BPS} onClose={() => setDetailId(null)} />}

      {pick && picked && (
        <StakeSheet row={picked} initialYes={pick.yes} now={now} gameRef={gameRef} onClose={() => setPick(null)} />
      )}
    </div>
  );
}

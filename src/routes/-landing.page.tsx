// Landing / (prototype design/prototype/web-design-2026-10-14, L2-OnAir3D): partai unggulan (live dulu, lalu replay)
// di papan 3D, pasar terbuka yang paling cepat terkunci sebagai lower third, Next to lock lintas meja, How results work.
// Semua angka dari resolver (GET /games, GET /games/:gameRef, SSE); tanpa data contoh.
import { SOT, type GameSummary } from "@movemarket/shared";
import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BoardSurface } from "../components/board/BoardSurface.tsx";
import { sanTag } from "../components/board/lastMove.ts";
import { boardLabel, FlatBoard } from "../components/board/LiveBoard.tsx";
import { useLastMove } from "../components/board/useLastMove.ts";
import { COPY, UI, fill } from "../components/common/copy.ts";
import { clock, yesPct } from "../components/common/format.ts";
import { Spinner } from "../components/common/Spinner.tsx";
import { Empty, ErrorBox, Skeleton } from "../components/common/States.tsx";
import { useNowSec } from "../components/common/useNowSec.ts";
import { SourceTag, gameTitle } from "../components/game/GameHeader.tsx";
import { LowerThird } from "../components/market/LowerThird.tsx";
import { StakeSheet, type Row } from "../components/market/StakeSheet.tsx";
import type { Game, Market } from "../contracts/data.ts";
import { deriveMarketPhase, isClosingSoon } from "../lib/marketPhase.ts";
import { gameQuery } from "../queries/index.ts";
import { useAccountView, useChainOffset, useGames, usePositions } from "./-wiring.ts";

const FEE_BPS = SOT.contract.defaults.feeBps;
const NUMS = { plies: SOT.planner.WINDOW_PLIES, sec: SOT.planner.BET_WINDOW_SEC, fee: FEE_BPS / 100 };
const NEXT_ROWS = 8;
const L = UI.landing;

type Open = { market: Market; table: number; game: GameSummary };

/** Live dulu, lalu replay; partai yang sudah selesai hanya kalau tidak ada yang lain. */
const pickFeatured = (games: GameSummary[]) =>
  games.find((g) => !g.ended && !g.isReplay) ?? games.find((g) => !g.ended) ?? games[0];

export function LandingPage() {
  const games = useGames();
  const list = games.data ?? [];
  const featured = pickFeatured(list);
  const watched = list.filter((g) => !g.ended || g === featured);
  const details = useQueries({ queries: watched.map((g) => gameQuery(g.gameRef)) });
  const byRef = new Map<string, Game>();
  details.forEach((d) => d.data && byRef.set(d.data.game.gameRef, d.data));
  const now = useNowSec(useChainOffset());
  const acct = useAccountView();
  const positions = usePositions(acct.address);
  const navigate = useNavigate();
  const [pick, setPick] = useState<{ market: Market; yes: boolean } | null>(null);

  const table = (ref: string) => list.findIndex((g) => g.gameRef === ref) + 1;
  const open: Open[] = watched
    .flatMap((g) => (byRef.get(g.gameRef)?.markets ?? []).map((m) => ({ market: m, table: table(g.gameRef), game: g, ply: byRef.get(g.gameRef)!.game.ply })))
    .filter((o) => deriveMarketPhase(o.market, o.ply, now).phase === "open")
    .sort((a, b) => a.market.lockTime - b.market.lockTime);
  const detail = featured ? byRef.get(featured.gameRef) : undefined;
  const pinned = open.find((o) => o.game === featured) ?? open[0];
  const mine = (m: Market) => positions?.find((p) => p.gameRef === m.gameRef && p.marketId === m.id);

  const onPick = (market: Market, yes: boolean) => {
    if (acct.status === "none") void navigate({ to: "/onboarding" });
    else if (acct.status === "locked") acct.unlock();
    else if (acct.status === "unlocked") setPick({ market, yes });
  };
  const pickedRow: Row | undefined = pick ? (() => {
    const g = byRef.get(pick.market.gameRef);
    const market = g?.markets.find((m) => m.id === pick.market.id) ?? pick.market;
    return { market, phase: deriveMarketPhase(market, g?.game.ply ?? 0, now), position: mine(market) };
  })() : undefined;

  return (
    <>
      <Hero
        featured={featured} detail={detail} table={featured ? table(featured.gameRef) : 0}
        loading={games.isPending} now={now} pinned={pinned} mine={pinned && mine(pinned.market)} onPick={onPick}
      />
      <NextToLock open={open} now={now} games={games} />
      <HowResults />
      {acct.status === "none" && (
        <section aria-labelledby="cta-h" className="bg-gold text-ink">
          <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-5 px-4 py-10 sm:px-7">
            <h2 id="cta-h" className="display m-0 text-[36px] leading-[0.9] sm:text-[52px]">{L.ctaLead}<br />{L.ctaTail}</h2>
            <Link to="/onboarding" className="btn dark lg">{COPY.actions.createAccount}</Link>
          </div>
        </section>
      )}
      <p className="mx-auto mt-0 mb-0 flex max-w-[1380px] flex-wrap gap-x-7 gap-y-1 px-4 pt-5 text-[13px] text-muted sm:px-7">
        {L.credits.map((c) => <span key={c}>{c}</span>)}
      </p>
      {pick && pickedRow && (
        <StakeSheet row={pickedRow} initialYes={pick.yes} now={now} gameRef={pick.market.gameRef} onClose={() => setPick(null)} />
      )}
    </>
  );
}

// ----------------------------------------------------------------- hero

function StartCta({ watchRef }: { watchRef?: string }) {
  const acct = useAccountView();
  if (acct.status === "none") return <Link to="/onboarding" className="btn gold lg">{COPY.actions.start}</Link>;
  if (acct.status === "locked" || acct.status === "restoring") {
    const busy = acct.unlocking || acct.status === "restoring";
    return (
      <button type="button" className={`btn gold lg ${busy ? "busy" : ""}`} onClick={acct.unlock} disabled={busy}>
        {busy && <Spinner />}
        {COPY.actions.unlock}
      </button>
    );
  }
  return watchRef
    ? <Link to="/game/$gameRef" params={{ gameRef: watchRef }} className="btn gold lg">{UI.home.watch}</Link>
    : <Link to="/games" className="btn gold lg">{UI.nav.games}</Link>;
}

function Hero({ featured, detail, table, loading, now, pinned, mine, onPick }: {
  featured?: GameSummary; detail?: Game; table: number; loading: boolean; now: number;
  pinned?: Open; mine?: Row["position"]; onPick(m: Market, yes: boolean): void;
}) {
  const g = detail?.game ?? featured;
  const sans = detail?.game.sans ?? [];
  const lastSan = sans.at(-1);
  const move = useLastMove(g?.fen, lastSan, g?.ply ?? 0);
  const [narrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
  const tower = sans.slice(-4).map((san, i, a) => ({ san, ply: (g?.ply ?? 0) - a.length + 1 + i })).reverse();
  const settled = (detail?.markets ?? [])
    .map((m) => ({ m, phase: deriveMarketPhase(m, detail!.game.ply, now) }))
    .filter((r) => r.phase.phase === "provisional" || r.phase.phase === "final")
    .sort((a, b) => b.m.toPly - a.m.toPly)
    .slice(0, 3);

  const lede = (t: string) => fill(t, NUMS);
  const heading = (
    <h1 id="hero-h" className="display m-0 text-[clamp(44px,15vw,60px)] leading-[0.86] [font-stretch:66%] lg:text-[104px]">
      {L.heroLead} <span className="text-gold">{L.heroAccent}</span>
    </h1>
  );

  return (
    <section aria-labelledby="hero-h" className="overflow-hidden bg-studio">
      <div className="mx-auto max-w-[1600px] px-4 pt-5 pb-6 sm:px-7 lg:px-14 lg:pt-12">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-3 lg:gap-[18px] lg:pb-9">
            {g && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <SourceTag isReplay={g.isReplay} />
                <b className="display text-base lg:text-lg">{fill(L.table, { n: table })}</b>
                <span className="min-w-0 truncate text-[15px] text-muted max-lg:hidden">{gameTitle(g)}</span>
                {lastSan && <span className="text-sm text-muted lg:hidden">{fill(L.plyLine, { ply: g.ply, san: lastSan })}</span>}
              </div>
            )}
            {heading}
            <div className="flex flex-col gap-[18px] max-lg:hidden">
              <p className="m-0 max-w-[440px] text-[19px] text-soft">{lede(L.lede)}</p>
              <div className="flex flex-wrap items-center gap-3.5">
                <StartCta watchRef={featured?.gameRef} />
                <a href="#next" className="link">{L.seeLocking}</a>
              </div>
            </div>
            {tower.length > 0 && (
              <ol aria-label={L.lastPlies} className="m-0 mt-auto hidden w-[300px] list-none flex-col gap-[3px] p-0 pt-6 lg:flex">
                {tower.map((r, i) => {
                  const tag = sanTag(r.san);
                  return (
                    <li key={r.ply} className={`grid grid-cols-[40px_18px_minmax(0,1fr)_auto] items-center gap-2 rounded-[3px] px-2.5 py-1.5 text-[15px] ${i === 0 ? "bg-gold text-ink" : "bg-night/80 text-white"}`}>
                      <span className="font-black [font-stretch:75%]">{r.ply}</span>
                      <span aria-hidden="true" className={`h-3 w-3 rounded-tag shadow-[inset_0_0_0_1px_var(--color-piece-edge)] ${r.ply % 2 ? "bg-piece-white" : "bg-piece-black"}`} />
                      <span className="font-bold">{r.san}</span>
                      {tag && <span className={`text-xs font-extrabold uppercase [font-stretch:75%] ${i === 0 ? "" : "text-gold"}`}>{L.plyTag[tag]}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="relative -mx-4 h-[min(92vw,420px)] sm:mx-0 sm:h-[460px] lg:-mr-14 lg:h-[700px]">
            {g ? (
              <>
                <span aria-hidden="true" className="pointer-events-none absolute top-0 right-6 z-[1] text-[13px] font-semibold text-muted max-lg:hidden">{L.dragHint}</span>
                <BoardSurface
                  view="3d" fen={g.fen} ply={g.ply} lastMove={move}
                  label={fill(UI.board.label3d, { ply: g.ply, last: lastSan ? `${fill(UI.game.lastMove, { san: lastSan })}.` : "" })}
                  scene={narrow ? { dist: 27, offsetNarrow: [0.03, -0.03], elev: 0.66 } : { dist: 21.5, fit: 1.3, offset: [0.02, -0.01], offsetNarrow: [0.02, -0.01] }}
                  flat={
                    <div className="mx-auto h-full max-w-full p-4" style={{ aspectRatio: "1 / 1" }}>
                      <FlatBoard id="landing" fen={g.fen} lastMove={move} ply={g.ply} label={boardLabel(g.ply, lastSan)} />
                    </div>
                  }
                />
              </>
            ) : loading ? (
              <Skeleton className="mx-auto aspect-square h-full max-w-full" />
            ) : null}
          </div>
        </div>

        {pinned ? (
          <div className="mt-2 lg:-mt-6">
            <LowerThird
              landing market={pinned.market} nowSec={now} position={mine} feeBps={FEE_BPS}
              onPick={(yes) => onPick(pinned.market, yes)}
              top={<ResultsStrip settled={settled} />}
            />
          </div>
        ) : g && !g.ended ? (
          <p className="m-0 mt-2 rounded-panel bg-deep px-4 py-3 text-soft">{UI.game.noOpen}</p>
        ) : null}

        <div className="flex flex-col gap-2.5 pt-3.5 lg:hidden">
          <p className="m-0 text-base text-soft">{lede(L.ledeShort)}</p>
          <div className="flex flex-col [&>*]:w-full">
            <StartCta watchRef={featured?.gameRef} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultsStrip({ settled }: { settled: { m: Market; phase: ReturnType<typeof deriveMarketPhase> }[] }) {
  return (
    <div aria-live="polite" className="hidden bg-control text-sm md:flex">
      <span className="display flex-none bg-panel px-3.5 py-[7px] text-sm [font-stretch:70%]">{L.results}</span>
      {settled.length === 0 ? (
        <span className="min-w-0 flex-1 truncate border-l border-divider px-3.5 py-[7px]">
          <b className="font-extrabold text-muted">{L.resultsEmpty}</b> · {L.resultsEmptyNote}
        </span>
      ) : settled.map(({ m, phase }) => {
        const outcome = "outcome" in phase ? phase.outcome : undefined;
        const text = fill(phase.phase === "final" ? COPY.market.status.final : COPY.market.status.provisional, { outcome: outcome ? COPY.market.outcome[outcome] : "" });
        return (
          <span key={String(m.id)} className="min-w-0 flex-1 truncate border-l border-divider px-3.5 py-[7px]">
            <b className={`font-extrabold ${outcome === "YES" ? "text-gold" : outcome === "NO" ? "text-coral" : "text-muted"}`}>{text}</b> · {m.question}
          </span>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- Next to lock

function NextToLock({ open, now, games }: { open: Open[]; now: number; games: ReturnType<typeof useGames> }) {
  const rows = open.slice(0, NEXT_ROWS);
  const cols = "grid grid-cols-[64px_minmax(0,1fr)_44px_44px] gap-x-3 sm:grid-cols-[90px_110px_minmax(0,1fr)_80px_80px] sm:gap-x-3";
  const pct = (m: Market, yes: boolean) => {
    const p = yesPct(m.poolYes, m.poolNo);
    return p === null ? UI.generic.noValue : `${yes ? p : 100 - p}%`;
  };
  return (
    <section id="next" aria-labelledby="next-h" className="scroll-mt-16 bg-night">
      <div className="mx-auto flex max-w-[1380px] flex-col gap-4 px-4 pt-11 pb-13 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="next-h" className="display m-0 text-[34px] [font-stretch:70%] sm:text-[44px]">{L.nextToLock}</h2>
          <span className="text-muted">{L.nextToLockNote}</span>
        </div>
        {games.isError && open.length === 0 ? (
          <ErrorBox action={<button type="button" className="btn gold sm" onClick={() => games.refetch()}>{COPY.actions.retry}</button>}>
            {COPY.errors.RESOLVER_OFFLINE}
          </ErrorBox>
        ) : games.isPending ? (
          <Skeleton className="h-[220px]" />
        ) : (games.data ?? []).length === 0 ? (
          <Empty>{COPY.home.noGames}</Empty>
        ) : rows.length === 0 ? (
          <Empty>{UI.game.noOpen}</Empty>
        ) : (
          <div role="table" aria-label={L.nextToLockLabel} className="flex flex-col gap-[3px]">
            <div role="row" className={`${cols} px-3.5 py-1.5 text-[13px] font-semibold text-muted`}>
              <span role="columnheader" className="max-sm:row-span-2">{L.colLocksIn}</span>
              <span role="columnheader" className="max-sm:sr-only">{L.colTable}</span>
              <span role="columnheader" className="max-sm:col-start-2 max-sm:row-start-1">{L.colMarket}</span>
              <span role="columnheader" className="max-sm:row-start-1">{UI.market.yes}</span>
              <span role="columnheader" className="max-sm:row-start-1">{UI.market.no}</span>
            </div>
            {rows.map(({ market: m, table }) => (
              <div key={`${m.gameRef}:${m.id}`} role="row" className={`${cols} items-center gap-y-0.5 rounded-[3px] bg-row px-3.5 py-3 font-bold sm:text-lg`}>
                <span role="cell" className={`display text-[22px] max-sm:row-span-2 sm:text-[26px] ${isClosingSoon(m.lockTime - now) ? "text-coral" : "text-gold"}`}>
                  <span role="timer">{clock(m.lockTime - now)}</span>
                </span>
                <span role="cell" className="display text-[13px] text-muted max-sm:col-start-2 max-sm:row-start-1 sm:text-lg sm:text-white">{fill(L.table, { n: table })}</span>
                <span role="cell" className="min-w-0 max-sm:col-start-2 max-sm:row-start-2">
                  <Link to="/game/$gameRef" params={{ gameRef: m.gameRef }} className="text-white no-underline hover:text-gold hover:underline">{m.question}</Link>
                </span>
                <span role="cell" className="text-gold max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1">{pct(m, true)}</span>
                <span role="cell" className="text-coral max-sm:col-start-4 max-sm:row-span-2 max-sm:row-start-1">{pct(m, false)}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/games" className="link self-start">{L.allGames}</Link>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- How results work

function HowResults() {
  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto flex max-w-[1380px] scroll-mt-16 flex-col gap-7 px-4 pt-13 pb-15 sm:px-7">
      <h2 id="how-h" className="display m-0 text-[34px] [font-stretch:70%] sm:text-[44px]">{L.howTitle}</h2>
      <ol className="m-0 list-none border-t border-rule p-0">
        {L.steps.map((s, i) => (
          <li key={s.title} className="grid items-baseline gap-x-7 gap-y-1.5 border-b border-rule py-5 md:grid-cols-[280px_1fr_auto]">
            <b className={`display text-[30px] leading-[0.95] md:text-[42px] ${i === 0 ? "text-gold" : i === L.steps.length - 1 ? "text-coral" : "text-white"}`}>{s.title}</b>
            <span className="max-w-[56ch] text-[17px] text-soft">{fill(s.text, NUMS)}</span>
            <span className="text-sm whitespace-nowrap text-muted tabular-nums">{fill(s.when, NUMS)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}


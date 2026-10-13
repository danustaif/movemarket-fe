// Pasar Open yang paling cepat terkunci, di-pin sebagai lower third siaran (DESIGN.md "Lower third", prototype L2-OnAir3D).
// Mobile: kartu di atas tab bar; desktop: satu baris tab gold, pertanyaan, dan tombol Yes/No.
// `landing`: versi hero landing (tab "Predict now / locks in", tidak menempel, `top` = strip Results di atasnya).
import type { ReactNode } from "react";
import type { Market, Position } from "../../contracts/data.ts";
import { isClosingSoon } from "../../lib/marketPhase.ts";
import { UI, fill } from "../common/copy.ts";
import { clock, odds, usdc, yesPct } from "../common/format.ts";
import { Countdown } from "./Countdown.tsx";

export function LowerThird({ market, nowSec, position, feeBps, onPick, landing, top }: {
  market: Market; nowSec: number; position?: Position; feeBps: number; onPick(yes: boolean): void;
  landing?: boolean; top?: ReactNode;
}) {
  const { poolYes, poolNo } = market;
  const pct = yesPct(poolYes, poolNo);
  const mine = position ? position.stakeYes + position.stakeNo : 0n;
  const tab = isClosingSoon(market.lockTime - nowSec) ? "bg-coral" : "bg-gold";
  const label = landing ? UI.landing.predictNow : UI.game.openNow;
  const btn = landing ? "shadow-[inset_0_0_0_2px_var(--color-ink)]" : "";
  return (
    <aside aria-label={label} className={landing ? "" : "sticky bottom-[66px] z-10 sm:bottom-3"}>
      <div className="overflow-hidden rounded-panel shadow-[0_18px_40px_rgb(0_0_0/.28)]">
        {top}
        <article aria-label={market.question} className="flex flex-col bg-white text-ink md:min-h-20 md:flex-row">
          <div className={`flex items-center justify-between gap-3 px-3 py-1.5 text-ink md:min-w-[170px] md:flex-col md:items-start md:justify-center md:gap-0 md:px-4.5 md:py-3 ${tab}`}>
            <span className="display text-[17px] whitespace-nowrap md:text-2xl">{label}</span>
            {landing
              ? <b role="timer" className="display text-[17px] md:font-bold md:normal-case md:[font-stretch:100%] md:text-sm">{fill(UI.landing.locksIn, { countdown: clock(market.lockTime - nowSec) })}</b>
              : <b className="text-sm"><Countdown lockTime={market.lockTime} nowSec={nowSec} /></b>}
          </div>
          <div className="flex min-w-0 flex-auto flex-col justify-center gap-0.5 px-3 pt-2 md:px-4.5 md:py-2.5">
            <h2 className="m-0 text-[17px] leading-tight font-extrabold md:text-2xl">{market.question}</h2>
            <span className="flex flex-wrap gap-x-3 text-[13px] text-ink-muted md:text-sm">
              <span>{fill(UI.detail.window, { fromPly: market.fromPly, toPly: market.toPly })}</span>
              <span>{fill(UI.market.pooled, { amount: usdc(poolYes + poolNo) })}</span>
              {mine > 0n && <b>{fill(UI.market.yourStake, { amount: usdc(mine) })}</b>}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-3 md:flex md:items-center md:gap-2.5 md:bg-wash md:px-4.5">
            <button type="button" className={`btn yes min-h-[52px] flex-col gap-0 md:min-w-[130px] ${btn}`} onClick={() => onPick(true)}>
              <span>{UI.market.yes}{pct !== null && ` ${pct}%`}</span>
              <small className="text-xs font-bold">{fill(UI.market.pays, { odds: odds(poolYes, poolNo, feeBps) })}</small>
            </button>
            <button type="button" className={`btn ${landing ? "bg-white text-ink hover:bg-wash" : "no"} min-h-[52px] flex-1 flex-col gap-0 md:min-w-[130px] ${btn}`} onClick={() => onPick(false)}>
              <span>{UI.market.no}{pct !== null && ` ${100 - pct}%`}</span>
              <small className="text-xs font-bold">{fill(UI.market.pays, { odds: odds(poolNo, poolYes, feeBps) })}</small>
            </button>
          </div>
        </article>
      </div>
    </aside>
  );
}

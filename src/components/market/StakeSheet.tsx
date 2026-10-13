// Lembar stake (DESIGN.md "Stake sheet"): dialog modal berisi BetPanel untuk satu pasar. Dipakai layar partai dan landing.
import { SOT } from "@movemarket/shared";
import { useEffect, useRef } from "react";
import type { Market, MarketPhase, Position } from "../../contracts/data.ts";
import { isClosingSoon } from "../../lib/marketPhase.ts";
import { useAccountView, useBet, useGetTokens } from "../../routes/-wiring.ts";
import { COPY, UI } from "../common/copy.ts";
import { BetPanel } from "./BetPanel.tsx";
import { Countdown } from "./Countdown.tsx";
import { OutcomeBadge } from "./OutcomeBadge.tsx";

const MAX_STAKE = BigInt(SOT.contract.defaults.maxStakePerUser);

export type Row = { market: Market; phase: MarketPhase; position?: Position };

export function StakeSheet({ row, initialYes, now, gameRef, onClose }: { row: Row; initialYes: boolean; now: number; gameRef: string; onClose(): void }) {
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
            initialYes={initialYes} balance={acct.balance}
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

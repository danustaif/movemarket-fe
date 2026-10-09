// Kartu pasar (FRONTEND.md bagian 8, DESIGN.md "Market card"). Open: pertanyaan besar, bar pool, tombol Yes/No.
// Fase lain: ringkas, warna netral supaya Voided/Expired tidak terbaca sebagai No.
import type { MarketCardProps } from "../../contracts/ui.ts";
import { SETTLED } from "../../lib/marketPhase.ts";
import { COPY, UI, fill } from "../common/copy.ts";
import { odds, usdc, yesPct } from "../common/format.ts";
import { TxLink } from "../common/TxLink.tsx";
import { OutcomeBadge } from "./OutcomeBadge.tsx";

export function PoolBar({ poolYes, poolNo }: { poolYes: bigint; poolNo: bigint }) {
  const pct = yesPct(poolYes, poolNo);
  return (
    <div aria-hidden="true" className={`flex h-2 overflow-hidden rounded-[3px] ${pct === null ? "bg-rule" : "bg-coral"}`}>
      {pct !== null && <span className="bg-gold" style={{ width: `${pct}%` }} />}
    </div>
  );
}

/**
 * `onPick` (tambahan opsional di luar kontrak ui.ts): dipanggil saat pengguna memilih Yes/No pada pasar Open.
 * Tanpa `onPick`, tombol Yes/No tidak tampil.
 */
export function MarketCard({ market, phase, position, feeBps, onPick }: MarketCardProps & { onPick?(yes: boolean): void }) {
  const { poolYes, poolNo } = market;
  const pct = yesPct(poolYes, poolNo);
  const mine = position ? position.stakeYes + position.stakeNo : 0n;
  const open = phase.phase === "open";
  const settled = SETTLED.has(phase.phase);

  return (
    <article
      className={`mcard ${open ? "shadow-[inset_0_0_0_2px_var(--color-rule)]" : ""} ${settled ? "bg-deep" : ""}`}
      aria-label={market.question}
    >
      <div className="flex items-center justify-between gap-2.5">
        <OutcomeBadge phase={phase} />
        <span className="text-right text-sm text-muted">{fill(UI.market.pooled, { amount: usdc(poolYes + poolNo) })}</span>
      </div>

      <h3 className={`m-0 font-extrabold ${open ? "text-xl leading-[1.3]" : "text-base leading-[1.3]"}`}>{market.question}</h3>

      {open ? (
        <>
          <PoolBar poolYes={poolYes} poolNo={poolNo} />
          {onPick && (
            <div className="flex gap-2">
              <button type="button" className="btn yes min-h-[54px] flex-col gap-0" onClick={() => onPick(true)}>
                <span>{UI.market.yes}{pct !== null && ` ${pct}%`}</span>
                <small className="text-xs font-bold">{fill(UI.market.pays, { odds: odds(poolYes, poolNo, feeBps) })}</small>
              </button>
              <button type="button" className="btn no min-h-[54px] flex-col gap-0" onClick={() => onPick(false)}>
                <span>{UI.market.no}{pct !== null && ` ${100 - pct}%`}</span>
                <small className="text-xs font-bold">{fill(UI.market.pays, { odds: odds(poolNo, poolYes, feeBps) })}</small>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-between gap-2.5 text-sm">
          <span>
            <span className="font-extrabold text-gold">{UI.market.yes} {usdc(poolYes)}</span>
            {" · "}
            <span className="font-extrabold text-coral">{UI.market.no} {usdc(poolNo)}</span>
          </span>
          {phase.phase === "provisional" && <span className="text-soft">{COPY.errors.FINAL_PENDING}</span>}
          {phase.phase === "final" && market.finalTx && <TxLink hash={market.finalTx} />}
        </div>
      )}

      {mine > 0n && <span className="text-sm font-bold text-gold">{fill(UI.market.yourStake, { amount: usdc(mine) })}</span>}
    </article>
  );
}

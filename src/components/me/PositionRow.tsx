// Baris posisi di /me (DESIGN.md "Positions table"): chip fase, pertanyaan, stake, aksi Claim (gold) / Refund (outline).
import type { MarketPhase } from "../../contracts/data.ts";
import type { PositionRowProps } from "../../contracts/ui.ts";
import { COPY, UI, fill } from "../common/copy.ts";
import { SYMBOL, usdc } from "../common/format.ts";
import { Spinner } from "../common/Spinner.tsx";
import { OutcomeBadge } from "../market/OutcomeBadge.tsx";

const refundable = (p: MarketPhase) => p.phase === "voided" || p.phase === "expired";

/**
 * Tambahan opsional: `question` dari cache partai, `busy` saat transaksi berjalan, `canClaim`/`canRefund` dari
 * gating blok finalized (usePayouts). Tanpa gating, tombol mengikuti fase dan posisi saja.
 */
export function PositionRow({ position, phase, onClaim, onRefund, question, busy, canClaim: gateClaim, canRefund: gateRefund }:
  PositionRowProps & { question?: string; busy?: boolean; canClaim?: boolean; canRefund?: boolean }) {
  const stake = position.stakeYes + position.stakeNo;
  const canClaim = !position.settled && (gateClaim ?? (position.claimable > 0n && phase.phase === "final"));
  const canRefund = !position.settled && (gateRefund ?? (stake > 0n && refundable(phase)));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-panel px-3.5 py-3">
      <OutcomeBadge phase={phase} />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col">
        <b className="leading-snug">{question ?? `#${position.marketId}`}</b>
        <span className="text-sm text-soft">
          {fill(UI.me.stakeLine, { yes: usdc(position.stakeYes), no: usdc(position.stakeNo) })}
        </span>
      </div>
      {canClaim && (
        <button type="button" className={`btn gold sm ${busy ? "busy" : ""}`} onClick={onClaim} disabled={busy}>
          {busy && <Spinner size={16} />}
          {COPY.actions.claim}{position.claimable > 0n && ` ${usdc(position.claimable)} ${SYMBOL}`}
        </button>
      )}
      {canRefund && (
        <button type="button" className={`btn ghost sm ${busy ? "busy" : ""}`} onClick={onRefund} disabled={busy}>
          {busy && <Spinner size={16} />}
          {COPY.actions.refund} {usdc(stake)} {SYMBOL}
        </button>
      )}
    </div>
  );
}

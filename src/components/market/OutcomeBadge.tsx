// Chip status pasar (DESIGN.md "Status chip"). Teks dari COPY.market.status.
import type { MarketPhase } from "../../contracts/data.ts";
import { COPY, fill } from "../common/copy.ts";
import { clock } from "../common/format.ts";

const S = COPY.market.status;
/** Di bawah ini chip Open berubah coral. */
const CLOSING_SEC = 5;

export function phaseLabel(p: MarketPhase): string {
  switch (p.phase) {
    case "open": return fill(S.open, { countdown: clock(p.secondsLeft) });
    case "locked": return S.locked;
    case "noStakes": return S.noStakes;
    case "waiting": return fill(S.waiting, { toPly: p.toPly });
    case "provisional": return fill(S.provisional, { outcome: COPY.market.outcome[p.outcome] });
    case "final": return fill(S.final, { outcome: COPY.market.outcome[p.outcome] });
    case "voided": return p.reason === 2 ? S.voidedNoWinners : S.voided;
    case "expired": return S.expired;
  }
}

function look(p: MarketPhase): string {
  switch (p.phase) {
    case "open": return p.secondsLeft <= CLOSING_SEC ? "bg-coral text-ink" : "bg-gold text-ink";
    case "locked": return "bg-amber text-ink";
    case "waiting": return "bg-soft text-ink";
    case "provisional": return "bg-white text-ink";
    case "final": return "bg-control text-white shadow-[inset_0_0_0_1px_var(--color-rule)]";
    case "voided":
    case "expired": return "bg-void text-white";
    case "noStakes": return "bg-deep text-muted shadow-[inset_0_0_0_1px_var(--color-rule)]";
  }
}

export function OutcomeBadge({ phase }: { phase: MarketPhase }) {
  return <span className={`tag ${look(phase)}`}>{phaseLabel(phase)}</span>;
}

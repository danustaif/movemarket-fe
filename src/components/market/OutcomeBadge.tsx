// Chip status pasar (DESIGN.md "Status chip"). Teks dari COPY.market.status.
import type { MarketPhase } from "../../contracts/data.ts";
import { isClosingSoon, isNoWinners } from "../../lib/marketPhase.ts";
import { COPY, fill } from "../common/copy.ts";
import { clock } from "../common/format.ts";

const STATUS = COPY.market.status;

export function phaseLabel(p: MarketPhase): string {
  switch (p.phase) {
    case "open": return fill(STATUS.open, { countdown: clock(p.secondsLeft) });
    case "locked": return STATUS.locked;
    case "noStakes": return STATUS.noStakes;
    case "waiting": return fill(STATUS.waiting, { toPly: p.toPly });
    case "provisional": return fill(STATUS.provisional, { outcome: COPY.market.outcome[p.outcome] });
    case "final": return fill(STATUS.final, { outcome: COPY.market.outcome[p.outcome] });
    case "voided": return isNoWinners(p.reason) ? STATUS.voidedNoWinners : STATUS.voided;
    case "expired": return STATUS.expired;
  }
}

function look(p: MarketPhase): string {
  switch (p.phase) {
    case "open": return isClosingSoon(p.secondsLeft) ? "bg-coral text-ink" : "bg-gold text-ink";
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

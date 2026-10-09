import { describe, expect, mock, test } from "bun:test";
import { SOT } from "@movemarket/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import { PositionRow } from "../../src/components/me/PositionRow.tsx";
import type { MarketPhase, Position } from "../../src/contracts/data.ts";
import { position } from "./helpers.tsx";

const SYMBOL = SOT.token.symbol;
const claimBtn = () => screen.queryByRole<HTMLButtonElement>("button", { name: new RegExp(`^${COPY.actions.claim}`) });
const refundBtn = () => screen.queryByRole<HTMLButtonElement>("button", { name: new RegExp(`^${COPY.actions.refund}`) });

function row(p: Position, phase: MarketPhase, gate: { canClaim?: boolean; canRefund?: boolean; busy?: boolean } = {}) {
  const onClaim = mock(() => {});
  const onRefund = mock(() => {});
  render(<PositionRow position={p} phase={phase} onClaim={onClaim} onRefund={onRefund} question="Any check?" {...gate} />);
  return { onClaim, onRefund };
}

describe("PositionRow", () => {
  const won = position({ stakeYes: 12_000_000n, claimable: 12_500_000n, status: 1, outcome: 1 });
  const voided = position({ stakeYes: 1_500_000n, stakeNo: 250_000n, status: 2 });

  test("Claim only when canClaim (finalized read) is true, with the bigint amount formatted", async () => {
    const { onClaim } = row(won, { phase: "final", outcome: "YES" }, { canClaim: true, canRefund: false });
    expect(claimBtn()!.textContent).toBe(`${COPY.actions.claim} 12.50 ${SYMBOL}`);
    expect(refundBtn()).toBeNull();
    await userEvent.setup().click(claimBtn()!);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  test("final with claimable > 0 but not yet claimable at the finalized block: no Claim", () => {
    row(won, { phase: "final", outcome: "YES" }, { canClaim: false, canRefund: false });
    expect(claimBtn()).toBeNull();
  });

  test("Refund only when canRefund is true, amount is the total stake", async () => {
    const { onRefund } = row(voided, { phase: "voided", reason: null }, { canClaim: false, canRefund: true });
    expect(refundBtn()!.textContent).toBe(`${COPY.actions.refund} 1.75 ${SYMBOL}`);
    expect(claimBtn()).toBeNull();
    await userEvent.setup().click(refundBtn()!);
    expect(onRefund).toHaveBeenCalledTimes(1);
  });

  test("voided but canRefund false at the finalized block: no Refund", () => {
    row(voided, { phase: "voided", reason: null }, { canClaim: false, canRefund: false });
    expect(refundBtn()).toBeNull();
  });

  test("settled position shows no action even if the gate is still true", () => {
    row({ ...won, settled: true }, { phase: "final", outcome: "YES" }, { canClaim: true, canRefund: true });
    expect(claimBtn()).toBeNull();
    expect(refundBtn()).toBeNull();
  });

  test("busy disables the action", () => {
    row(won, { phase: "final", outcome: "YES" }, { canClaim: true, busy: true });
    expect(claimBtn()!.disabled).toBe(true);
  });

  test("stake line formats both sides with 6-decimal bigint", () => {
    row(position({ stakeYes: 1_000_001n, stakeNo: 20_000_000n }), { phase: "locked" });
    expect(screen.getByText(fill(UI.me.stakeLine, { yes: "1.000001", no: "20.00" }))).toBeTruthy();
  });
});

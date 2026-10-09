import { describe, expect, mock, test } from "bun:test";
import { ENUMS, SOT } from "@movemarket/shared";
import { render, screen, within } from "@testing-library/react";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import { MarketCard } from "../../src/components/market/MarketCard.tsx";
import type { MarketPhase } from "../../src/contracts/data.ts";
import { deriveMarketPhase } from "../../src/lib/marketPhase.ts";
import { market } from "./helpers.tsx";

const S = COPY.market.status;
const FEE = SOT.contract.defaults.feeBps;
const voidReason = (name: string) => Number(Object.entries(ENUMS.VoidReason).find(([, n]) => n === name)![0]) as never;

function card(phase: MarketPhase, m = market({ poolYes: 3_000_000n, poolNo: 1_000_000n })) {
  const onPick = mock((_yes: boolean) => {});
  const { unmount } = render(<MarketCard market={m} phase={phase} feeBps={FEE} onPick={onPick} />);
  return { el: screen.getByRole("article", { name: m.question }), onPick, unmount };
}

describe("MarketCard phase label", () => {
  const cases: [string, MarketPhase, string][] = [
    ["open with countdown", { phase: "open", secondsLeft: 72 }, fill(S.open, { countdown: "1:12" })],
    ["locked", { phase: "locked" }, S.locked],
    ["waiting", { phase: "waiting", toPly: 36 }, fill(S.waiting, { toPly: 36 })],
    ["provisional", { phase: "provisional", outcome: "YES" }, fill(S.provisional, { outcome: COPY.market.outcome.YES })],
    ["final", { phase: "final", outcome: "NO" }, fill(S.final, { outcome: COPY.market.outcome.NO })],
    ["voided", { phase: "voided", reason: null }, S.voided],
    ["voided, no winning stakes", { phase: "voided", reason: voidReason("NO_WINNERS") }, S.voidedNoWinners],
    ["expired", { phase: "expired" }, S.expired],
    ["no stakes", { phase: "noStakes" }, S.noStakes],
  ];
  for (const [name, phase, label] of cases) {
    test(name, () => {
      const { el } = card(phase);
      expect(within(el).getByText(label)).toBeTruthy();
    });
  }

  test("provisional shows FINAL_PENDING next to the pools", () => {
    const { el } = card({ phase: "provisional", outcome: "NO" });
    expect(within(el).getByText(COPY.errors.FINAL_PENDING)).toBeTruthy();
  });
});

describe("MarketCard Yes/No", () => {
  test("odds show '-' for a side whose pool is 0", () => {
    const { el } = card({ phase: "open", secondsLeft: 60 }, market({ poolYes: 2_000_000n, poolNo: 0n }));
    // Satu-satunya sisi berisi: semua pool kembali ke sisi YES tanpa fee, x1.00.
    expect(within(el).getByRole("button", { name: new RegExp(`^${UI.market.yes}`) }).textContent).toContain(fill(UI.market.pays, { odds: "x1.00" }));
    expect(within(el).getByRole("button", { name: new RegExp(`^${UI.market.no}`) }).textContent).toContain(fill(UI.market.pays, { odds: "-" }));
  });

  test("picking a side reports it", () => {
    const { el, onPick } = card({ phase: "open", secondsLeft: 60 });
    within(el).getByRole("button", { name: new RegExp(`^${UI.market.no}`) }).click();
    expect(onPick).toHaveBeenCalledWith(false);
  });

  test("stake buttons are gone once nowSec >= lockTime - lockMarginSec", () => {
    const m = market({ lockTime: 1_000_000, poolYes: 1_000_000n, poolNo: 1_000_000n });
    const before = card(deriveMarketPhase(m, 20, 1_000_000 - SOT.frontend.lockMarginSec - 0.001), m);
    expect(within(before.el).getAllByRole("button").length).toBe(2);
    before.unmount();
    const at = card(deriveMarketPhase(m, 20, 1_000_000 - SOT.frontend.lockMarginSec), m);
    expect(within(at.el).queryAllByRole("button").length).toBe(0);
    expect(within(at.el).getByText(S.locked)).toBeTruthy();
  });
});

describe("MarketCard CRE report link", () => {
  const tx = "0xabc1000000000000000000000000000000000000000000000000000000003456" as const;
  test("final with a report tx links to the explorer", () => {
    const { el } = card({ phase: "final", outcome: "YES" }, market({ final: "YES", finalTx: tx }));
    const link = within(el).getByRole("link", { name: fill(UI.market.finalTx, { tx: "0xabc1…3456" }) });
    expect(link.getAttribute("href")).toBe(`${SOT.network.explorer}/tx/${tx}`);
    expect(link.getAttribute("target")).toBe("_blank");
  });
  test("no link without a tx hash", () => {
    const { el } = card({ phase: "final", outcome: "YES" }, market({ final: "YES" }));
    expect(within(el).queryAllByRole("link")).toHaveLength(0);
  });
});

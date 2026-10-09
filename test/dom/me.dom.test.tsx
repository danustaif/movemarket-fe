import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GAS_LIMITS, SOT } from "@movemarket/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import { qk } from "../../src/contracts/data.ts";
import { gasLimits, txSenderFor } from "../../src/lib/account/session.ts";
import { chain, publicClient } from "../../src/lib/chain.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { absent, position, renderApp, stubBoundaries } from "./helpers.tsx";

const SYMBOL = SOT.token.symbol;
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const addr = account.address;
const receipt = { status: "success", blockNumber: 1n } as TransactionReceipt;

const positions = [
  position({ marketId: 7n, stakeYes: 10_000_000n, claimable: 12_500_000n, status: 1, outcome: 1 }),
  position({ marketId: 8n, stakeNo: 2_000_000n, claimable: 3_000_000n, status: 1, outcome: 2 }),
  position({ marketId: 9n, stakeYes: 1_000_000n, status: 2 }),
];
// Angka di blok finalized (SOT D20): 7 dan 8 bisa diklaim, 9 bisa di-refund.
const payouts = {
  "7": { claimable: 12_500_000n, refundable: 0n },
  "8": { claimable: 3_000_000n, refundable: 0n },
  "9": { claimable: 0n, refundable: 1_000_000n },
};

let liveMarket: ReturnType<typeof spyOn<ReturnType<typeof txSenderFor>, "liveMarket">>;

function renderMe() {
  const r = renderApp("/me");
  r.queryClient.setQueryData(qk.positions(addr), positions);
  r.queryClient.setQueryData(["payouts", addr.toLowerCase(), ["7", "8", "9"]], payouts);
  r.queryClient.setQueryData(qk.balance(addr), 50_000_000n);
  return r;
}

const claimAll = () => screen.findByRole<HTMLButtonElement>("button", { name: COPY.actions.claimAll });

beforeEach(() => {
  stubBoundaries();
  useAccountStore.getState().setUnlocked(account);
  liveMarket = spyOn(txSenderFor(account), "liveMarket").mockResolvedValue(receipt);
});
afterEach(() => mock.restore());

describe("/me", () => {
  test("Claim all is disabled with GAS_NOT_MEASURED while claimMany gas is null; per-market claim still works", async () => {
    const original = gasLimits.current;
    gasLimits.current = { ...GAS_LIMITS, claimManyBase: null, claimManyPerMarket: null };
    try {
    renderMe();
    const all = await claimAll();
    expect(all.disabled).toBe(true);
    const note = document.getElementById(all.getAttribute("aria-describedby")!);
    expect(note?.textContent).toBe(COPY.errors.GAS_NOT_MEASURED);
    expect(screen.getByText(`12.50`, { exact: false })).toBeTruthy();

    const claim7 = screen.getByRole<HTMLButtonElement>("button", { name: `${COPY.actions.claim} 12.50 ${SYMBOL}` });
    expect(claim7.disabled).toBe(false);
    await userEvent.setup().click(claim7);
    await waitFor(() => expect(liveMarket).toHaveBeenCalledWith("claim", [7n]));
    expect(liveMarket).not.toHaveBeenCalledWith("claimMany", expect.anything());
    } finally {
      gasLimits.current = original;
    }
  });

  test("shows the MON gas balance read from the chain", async () => {
    const getBalance = spyOn(publicClient, "getBalance").mockResolvedValue(512_345_678_900_000_000n);
    renderMe();
    expect(await screen.findByText(`0.5123 ${chain.nativeCurrency.symbol}`)).toBeTruthy();
    expect(screen.getByText(UI.me.gas)).toBeTruthy();
    expect(getBalance).toHaveBeenCalledWith({ address: addr });
  });

  test("refund per market goes through refund", async () => {
    renderMe();
    const refund = await screen.findByRole("button", { name: `${COPY.actions.refund} 1.00 ${SYMBOL}` });
    await userEvent.setup().click(refund);
    await waitFor(() => expect(liveMarket).toHaveBeenCalledWith("refund", [9n]));
  });

  describe("with measured claimMany gas (seam gasLimits)", () => {
    const original = gasLimits.current;
    beforeEach(() => { gasLimits.current = { ...GAS_LIMITS, claimManyBase: 60_000, claimManyPerMarket: 40_000 }; });
    afterEach(() => { gasLimits.current = original; });

    test("Claim all is enabled and claims every finalized-claimable market", async () => {
      renderMe();
      const all = await claimAll();
      expect(all.disabled).toBe(false);
      expect(all.getAttribute("aria-describedby")).toBeNull();
      absent(screen.queryByText(COPY.errors.GAS_NOT_MEASURED));
      const ready = all.parentElement!;
      expect(within(ready).getByText("15.50", { exact: false })).toBeTruthy();
      const user = userEvent.setup();
      await user.click(all);
      // Konfirmasi dulu: belum ada transaksi sebelum pengguna menekan Claim all di dialog.
      const dialog = await screen.findByRole("dialog", { name: fill(UI.me.claimAllTitle, { amount: "15.50" }) });
      expect(within(dialog).getByText(fill(UI.me.claimAllNote, { n: 2 }))).toBeTruthy();
      expect(liveMarket).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: COPY.actions.claimAll }));
      await waitFor(() => expect(liveMarket).toHaveBeenCalledWith("claimMany", [[7n, 8n]]));
    });

    test("Cancel in the Claim all dialog sends nothing", async () => {
      renderMe();
      const user = userEvent.setup();
      await user.click(await claimAll());
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: UI.stake.cancel }));
      await waitFor(() => absent(screen.queryByRole("dialog")));
      expect(liveMarket).not.toHaveBeenCalled();
    });
  });
});

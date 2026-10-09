import { describe, expect, mock, test } from "bun:test";
import { SOT } from "@movemarket/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COPY, UI } from "../../src/components/common/copy.ts";
import { BetPanel, type BetPanelExtra } from "../../src/components/market/BetPanel.tsx";
import type { BetPanelProps } from "../../src/contracts/ui.ts";
import { absent, market, renderInRouter } from "./helpers.tsx";

const SYMBOL = SOT.token.symbol;

async function panel(p: Partial<BetPanelProps & BetPanelExtra> = {}) {
  const onStake = mock((_yes: boolean, _amount: bigint) => {});
  const props = { market: market(), remainingCap: 100_000_000n, account: "unlocked" as const, pending: false, onStake, ...p };
  const r = renderInRouter(<BetPanel {...props} />);
  const input = await screen.findByRole<HTMLInputElement>("textbox", { name: UI.stake.amountLabel });
  return { ...r, input, onStake, user: userEvent.setup() };
}

const stakeButton = () => screen.getByRole<HTMLButtonElement>("button", { name: new RegExp(`^${COPY.actions.stake}`) });

async function typeAmount(input: HTMLInputElement, text: string) {
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, text);
}

describe("BetPanel", () => {
  test("chips come from SOT.frontend.betChipsUsdc and fill the amount", async () => {
    const { input, user } = await panel();
    const chips = SOT.frontend.betChipsUsdc.map((c) => screen.getByRole("button", { name: `${c} ${SYMBOL}` }));
    expect(chips.length).toBe(SOT.frontend.betChipsUsdc.length);
    const last = SOT.frontend.betChipsUsdc.at(-1)!;
    await user.click(screen.getByRole("button", { name: `${last} ${SYMBOL}` }));
    expect(input.value).toBe(String(last));
    expect(screen.getByRole("button", { name: `${last} ${SYMBOL}` }).getAttribute("aria-pressed")).toBe("true");
  });

  test("custom amount below the minimum disables Stake and explains why", async () => {
    const { input } = await panel();
    await typeAmount(input, "0.5");
    expect(screen.getByRole("alert").textContent).toContain(COPY.errors.AmountTooSmall);
    expect(stakeButton().disabled).toBe(true);
  });

  test("custom amount above the remaining cap disables Stake and explains why", async () => {
    const { input } = await panel({ remainingCap: 3_000_000n });
    await typeAmount(input, "3.000001");
    expect(screen.getByRole("alert").textContent).toContain(COPY.errors.StakeCapExceeded);
    expect(stakeButton().disabled).toBe(true);
  });

  test("valid custom amount (min and exactly the remaining cap) stakes the bigint amount on the picked side", async () => {
    const { input, user, onStake } = await panel({ remainingCap: 3_000_000n });
    await typeAmount(input, "1");
    absent(screen.queryByRole("alert"));
    await typeAmount(input, "3");
    await user.click(screen.getByRole("button", { name: UI.market.no }));
    expect(stakeButton().textContent).toBe(`${COPY.actions.stake} 3.00 ${SYMBOL}`);
    await user.click(stakeButton());
    expect(onStake).toHaveBeenCalledWith(false, 3_000_000n);
  });

  test("amount above the balance shows INSUFFICIENT_USDC with Get test tokens", async () => {
    const onGetTokens = mock(() => {});
    const { input, user } = await panel({ balance: 2_000_000n, onGetTokens });
    await typeAmount(input, "5");
    expect(screen.getByRole("alert").textContent).toContain(COPY.errors.INSUFFICIENT_USDC);
    expect(stakeButton().disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: COPY.actions.getTestTokens }));
    expect(onGetTokens).toHaveBeenCalledTimes(1);
  });

  test("without an account the action leads to onboarding", async () => {
    const { router, user } = await panel({ account: "none" });
    absent(screen.queryByRole("button", { name: new RegExp(`^${COPY.actions.stake}`) }));
    const link = screen.getByRole("link", { name: COPY.actions.createAccount });
    await user.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
  });

  test("locked account shows Unlock, disabled while unlocking", async () => {
    const onUnlock = mock(() => {});
    const { user, unmount } = await panel({ account: "locked", onUnlock });
    await user.click(screen.getByRole("button", { name: COPY.actions.unlock }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    unmount();
    await panel({ account: "locked", onUnlock, unlocking: true });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: COPY.actions.unlock }).disabled).toBe(true);
  });

  test("pending stake shows Sending and cannot be sent twice", async () => {
    const { onStake, user } = await panel({ pending: true });
    const button = screen.getByRole<HTMLButtonElement>("button", { name: UI.stake.sending });
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(onStake).not.toHaveBeenCalled();
  });
});

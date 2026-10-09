import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { liveMarketAbi } from "@movemarket/shared";
import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractFunctionRevertedError, encodeErrorResult, maxUint256, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import { qk } from "../../src/contracts/data.ts";
import { txSenderFor } from "../../src/lib/account/session.ts";
import { createSseBridge } from "../../src/lib/sse.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { absent, GAME_REF, game, market, nowSec, renderApp, stubBoundaries } from "./helpers.tsx";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const QUESTION = "Any check in plies 33 to 36?";

/** EventSource palsu: event dikirim lewat bridge SSE asli (reducer + cache), tanpa koneksi. */
class FakeEventSource extends EventTarget {
  static last: FakeEventSource;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.last = this;
  }
  close() {}
  emit(name: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  }
}

function connectSse(queryClient: QueryClient) {
  const disconnect = createSseBridge({
    baseUrl: "http://resolver.test",
    queryClient,
    getAddress: () => useAccountStore.getState().address,
    EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
  }).connect();
  return { es: FakeEventSource.last, disconnect };
}

let b: ReturnType<typeof stubBoundaries>;
beforeEach(() => {
  b = stubBoundaries();
  b.game.mockResolvedValue(game([market({ id: 7n, question: QUESTION, poolYes: 2_000_000n, poolNo: 2_000_000n })]));
});
afterEach(() => mock.restore());

const card = () => screen.getByRole("article", { name: QUESTION });
const stakeButton = (root: HTMLElement) => within(root).queryByRole<HTMLButtonElement>("button", { name: new RegExp(`^${COPY.actions.stake} `) });

async function openSheet(yes = true) {
  const user = userEvent.setup();
  const r = renderApp(`/game/${encodeURIComponent(GAME_REF)}`);
  const pick = await within(await screen.findByRole("article", { name: QUESTION })).findByRole("button", { name: new RegExp(`^${yes ? UI.market.yes : UI.market.no}`) });
  await user.click(pick);
  const sheet = await screen.findByRole("dialog", { name: QUESTION });
  return { ...r, user, sheet };
}

describe("/game/$gameRef", () => {
  test("SSE market_locked closes betting: stake button gone from the sheet, card moves to In play", async () => {
    useAccountStore.getState().setUnlocked(account);
    const { queryClient, sheet } = await openSheet();
    expect(stakeButton(sheet)).not.toBeNull();
    const { es, disconnect } = connectSse(queryClient);

    act(() => es.emit("market_locked", { gameRef: GAME_REF, marketIds: ["7"], lockTime: nowSec() }));

    await waitFor(() => absent(stakeButton(sheet)));
    expect(within(sheet).getByRole("alert").textContent).toBe(COPY.errors.BettingClosed);
    const inPlay = screen.getByRole("region", { name: new RegExp(`^${UI.game.inPlay}`) });
    expect(within(inPlay).getByRole("article", { name: QUESTION })).toBeTruthy();
    expect(within(card()).queryAllByRole("button", { name: new RegExp(`^(${UI.market.yes}|${UI.market.no})`) })).toHaveLength(0);
    disconnect();
  });

  test("stake updates the pool optimistically, then rolls back with a BettingClosed toast", async () => {
    useAccountStore.getState().setUnlocked(account);
    let reject!: (e: unknown) => void;
    const bet = spyOn(txSenderFor(account), "liveMarket").mockImplementation(
      () => new Promise<TransactionReceipt>((_, rj) => { reject = rj; }),
    );
    const { queryClient, sheet, user } = await openSheet(true);
    queryClient.setQueryData(qk.balance(account.address), 50_000_000n);
    queryClient.setQueryData(qk.allowance(account.address), maxUint256);
    // Refetch setelah gagal tidak pernah selesai: yang terlihat hanya hasil rollback.
    b.game.mockImplementation(() => new Promise(() => {}));
    const pooled = (amount: string) => fill(UI.market.pooled, { amount });
    expect(within(card()).getByText(pooled("4.00"))).toBeTruthy();

    await user.click(stakeButton(sheet)!);
    await waitFor(() => expect(bet).toHaveBeenCalledWith("bet", [7n, true, 1_000_000n]));
    expect(within(card()).getByText(pooled("5.00"))).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: UI.stake.sending })).toBeTruthy();

    const revert = new ContractFunctionRevertedError({
      abi: liveMarketAbi,
      data: encodeErrorResult({ abi: liveMarketAbi, errorName: "BettingClosed", args: [7n] }),
      functionName: "bet",
    });
    await act(async () => reject(new Error("execution reverted", { cause: revert })));

    await waitFor(() => expect(within(card()).getByText(pooled("4.00"))).toBeTruthy());
    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(COPY.errors.BettingClosed);
  });

  test("the soonest-locking open market is pinned as the lower third, the rest stay in Open now", async () => {
    const LATER = "Any capture in plies 37 to 40?";
    b.game.mockResolvedValue(game([
      market({ id: 8n, question: LATER, lockTime: nowSec() + 240 }),
      market({ id: 7n, question: QUESTION, lockTime: nowSec() + 60, poolYes: 3_000_000n, poolNo: 1_000_000n }),
    ]));
    renderApp(`/game/${encodeURIComponent(GAME_REF)}`);
    const pinned = await screen.findByRole("complementary", { name: UI.game.openNow });
    const lt = within(pinned).getByRole("article", { name: QUESTION });
    expect(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.yes} 75%`) })).toBeTruthy();
    const list = screen.getByRole("region", { name: new RegExp(`^${UI.game.openNow}`) });
    expect(within(list).getByRole("article", { name: LATER })).toBeTruthy();
    expect(within(list).queryAllByRole("article", { name: QUESTION })).toHaveLength(0);
    // Pool bar vertikal di samping papan mengikuti pasar yang di-pin.
    const yes = `${UI.market.yes} ${fill(UI.market.poolShare, { pct: 75 })}`;
    expect(screen.getByRole("img", { name: new RegExp(`^${yes}`) })).toBeTruthy();
  });

  test("Details opens the market dialog: window, pools, timeline and the CRE report link", async () => {
    const tx = "0xabcd00000000000000000000000000000000000000000000000000000000beef" as const;
    b.game.mockResolvedValue(game([market({
      id: 7n, question: QUESTION, lockTime: nowSec() - 300, poolYes: 3_000_000n, poolNo: 1_000_000n,
      provisional: "YES", final: "YES", finalTx: tx,
    })], { ply: 40 }));
    const user = userEvent.setup();
    renderApp(`/game/${encodeURIComponent(GAME_REF)}`);
    const results = await screen.findByRole("region", { name: new RegExp(`^${UI.game.results}`) });
    await user.click(within(results).getByRole("button", { name: UI.market.details }));

    const dialog = await screen.findByRole("dialog", { name: QUESTION });
    expect(within(dialog).getByText(fill(UI.detail.window, { fromPly: 33, toPly: 36 }))).toBeTruthy();
    expect(within(dialog).getByText("3.00")).toBeTruthy();
    expect(within(dialog).getByText("1.00")).toBeTruthy();
    const steps = within(within(dialog).getByRole("list", { name: UI.detail.timeline })).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps.every((li) => li.textContent!.includes(UI.detail.done))).toBe(true);
    expect(steps[3]!.textContent).toContain(fill(COPY.market.status.final, { outcome: COPY.market.outcome.YES }));
    const link = within(steps[3]!).getByRole("link", { name: fill(UI.market.finalTx, { tx: "0xabcd…beef" }) });
    expect(link.getAttribute("href")).toContain(`/tx/${tx}`);

    await user.click(within(dialog).getAllByRole("button", { name: UI.stake.close }).at(-1)!);
    await waitFor(() => absent(screen.queryByRole("dialog")));
  });

  test("Details on a locked market: lock done, provisional and final still pending", async () => {
    b.game.mockResolvedValue(game([market({ id: 7n, question: QUESTION, lockTime: nowSec() - 30, poolYes: 1_000_000n })], { ply: 30 }));
    const user = userEvent.setup();
    renderApp(`/game/${encodeURIComponent(GAME_REF)}`);
    const inPlay = await screen.findByRole("region", { name: new RegExp(`^${UI.game.inPlay}`) });
    await user.click(within(inPlay).getByRole("button", { name: UI.market.details }));
    const dialog = await screen.findByRole("dialog", { name: QUESTION });
    const steps = within(dialog).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent!.includes(UI.detail.done))).toEqual([true, true, false, false]);
    expect(steps[3]!.textContent).toContain(UI.detail.final);
  });
});

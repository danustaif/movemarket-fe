import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { SOT } from "@movemarket/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { privateKeyToAccount } from "viem/accounts";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import type { Game } from "../../src/contracts/data.ts";
import { accountService } from "../../src/lib/account/mera.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { absent, ADDRESS, game, market, nowSec, renderApp, stubBoundaries } from "./helpers.tsx";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const LIVE = "lichess:game:livelive";
const REPLAY = "lichess:game:replayyy";
const Q_LIVE = "Any check in plies 33 to 36?";
const Q_REPLAY_SOON = "Any capture in plies 25 to 28?";
const Q_REPLAY_LATER = "White castles in plies 29 to 36?";

const replay: Game = game(
  [
    market({ id: 1n, gameRef: REPLAY, question: Q_REPLAY_LATER, lockTime: nowSec() + 200 }),
    market({ id: 2n, gameRef: REPLAY, question: Q_REPLAY_SOON, lockTime: nowSec() + 30, poolYes: 1_000_000n, poolNo: 3_000_000n }),
  ],
  { gameRef: REPLAY, isReplay: true, source: "replay", white: { name: "Carol" }, black: { name: "Dave" }, openMarkets: 2 },
);
const live: Game = game(
  [market({ id: 3n, gameRef: LIVE, question: Q_LIVE, lockTime: nowSec() + 90, poolYes: 3_000_000n, poolNo: 1_000_000n })],
  { gameRef: LIVE, isReplay: false, source: "tv", white: { name: "Alice" }, black: { name: "Bob" }, ply: 30, sans: ["e4", "e5", "Nf3", "Nc6"] },
);

let b: ReturnType<typeof stubBoundaries>;
beforeEach(() => {
  b = stubBoundaries();
  // Replay lebih dulu di daftar: partai unggulan tetap yang live.
  b.games.mockResolvedValue([replay.game, live.game]);
  b.game.mockImplementation((async (ref: string) => (ref === LIVE ? live : replay)) as never);
});
afterEach(() => mock.restore());

const hero = () => screen.getByRole("region", { name: `${UI.landing.heroLead} ${UI.landing.heroAccent}` });
const lowerThird = () => screen.findByRole("complementary", { name: UI.landing.predictNow });

describe("landing /", () => {
  test("features the live game and pins its soonest-locking open market", async () => {
    renderApp("/");
    const lt = await lowerThird();
    expect(within(hero()).getByText(fill(UI.game.versus, { white: "Alice", black: "Bob" }))).toBeTruthy();
    expect(within(lt).getByRole("article", { name: Q_LIVE })).toBeTruthy();
    expect(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.yes} 75%`) })).toBeTruthy();
  });

  test("falls back to replay when nothing is live", async () => {
    b.games.mockResolvedValue([replay.game]);
    renderApp("/");
    const lt = await lowerThird();
    expect(within(hero()).getByText(fill(UI.game.versus, { white: "Carol", black: "Dave" }))).toBeTruthy();
    expect(within(lt).getByRole("article", { name: Q_REPLAY_SOON })).toBeTruthy();
  });

  test("Next to lock lists open markets of every table, soonest lock first", async () => {
    renderApp("/");
    const region = await screen.findByRole("region", { name: UI.landing.nextToLock });
    await waitFor(() => expect(within(region).getAllByRole("row")).toHaveLength(4));
    const rows = within(region).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[2]!.textContent)).toEqual([Q_REPLAY_SOON, Q_LIVE, Q_REPLAY_LATER]);
    // Meja dinomori menurut urutan daftar partai; link pasar membuka layar partai.
    expect(within(rows[0]!).getByText(fill(UI.landing.table, { n: 1 }))).toBeTruthy();
    expect(within(rows[1]!).getByRole("link", { name: Q_LIVE }).getAttribute("href")).toBe(`/game/${encodeURIComponent(LIVE)}`);
  });

  test("without WebGL the hero shows the 2D board with the position as its accessible name", async () => {
    renderApp("/");
    await lowerThird();
    const board = within(hero()).getByRole("img", { name: new RegExp(fill(UI.game.plyMove, { ply: 30, move: 15 })) });
    expect(board.getAttribute("aria-label")).toContain(fill(UI.game.lastMove, { san: "Nc6" }));
  });

  test("no account: Start goes to onboarding, so does Yes on the pinned market", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    const lt = await lowerThird();
    // Hero punya CTA versi desktop dan mobile (CSS menyembunyikan salah satunya).
    const starts = within(hero()).getAllByRole("link", { name: COPY.actions.start });
    expect(starts.map((a) => a.getAttribute("href"))).toEqual(starts.map(() => "/onboarding"));
    await user.click(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.yes}`) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
  });

  test("locked account: Yes asks for the passkey", async () => {
    localStorage.setItem(SOT.account.storageKey, JSON.stringify({ rpId: "localhost", address: ADDRESS, credentialId: "c" }));
    useAccountStore.getState().lock();
    const unlock = spyOn(accountService, "unlock").mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderApp("/");
    const lt = await lowerThird();
    expect(within(hero()).getAllByRole("button", { name: COPY.actions.unlock }).length).toBeGreaterThan(0);
    await user.click(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.no}`) }));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  test("unlocked account: Yes opens the stake sheet for that market", async () => {
    useAccountStore.getState().setUnlocked(account);
    const user = userEvent.setup();
    renderApp("/");
    const lt = await lowerThird();
    await user.click(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.yes}`) }));
    const sheet = await screen.findByRole("dialog", { name: Q_LIVE });
    expect(within(sheet).getByRole("button", { name: new RegExp(`^${COPY.actions.stake}`) })).toBeTruthy();
  });

  test("How results work walks through open, locked, provisional, final and claim", async () => {
    renderApp("/");
    const how = await screen.findByRole("region", { name: UI.landing.howTitle });
    const steps = within(how).getAllByRole("listitem");
    expect(steps.map((s) => s.querySelector("b")?.textContent)).toEqual(UI.landing.steps.map((s) => s.title));
    expect(steps[4]!.textContent).toContain(`${SOT.contract.defaults.feeBps / 100}%`);
  });
  test("restoring session: Yes/No do nothing yet and the hero CTA waits", async () => {
    localStorage.setItem(SOT.account.storageKey, JSON.stringify({ rpId: "localhost", address: ADDRESS, credentialId: "c" }));
    useAccountStore.setState({ status: "restoring", address: ADDRESS });
    const unlock = spyOn(accountService, "unlock");
    const user = userEvent.setup();
    const { router } = renderApp("/");
    const lt = await lowerThird();
    const ctas = within(hero()).getAllByRole<HTMLButtonElement>("button", { name: COPY.actions.unlock });
    expect(ctas.every((b) => b.disabled)).toBe(true);
    await user.click(within(lt).getByRole("button", { name: new RegExp(`^${UI.market.yes}`) }));
    expect(unlock).not.toHaveBeenCalled();
    absent(screen.queryByRole("dialog"));
    expect(router.state.location.pathname).toBe("/");
  });
});

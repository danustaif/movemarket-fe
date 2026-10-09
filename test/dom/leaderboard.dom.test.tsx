import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import { COPY, UI } from "../../src/components/common/copy.ts";
import { renderApp, stubBoundaries } from "./helpers.tsx";

let b: ReturnType<typeof stubBoundaries>;
beforeEach(() => { b = stubBoundaries(); });
afterEach(() => mock.restore());

describe("/leaderboard", () => {
  test("loader fetches Envio rows and the table shows them in order with signed profit", async () => {
    b.leaderboard.mockResolvedValue([
      { address: "0x00000000000000000000000000000000000000aa", netProfit: 12_500_000n, betCount: 4, winCount: 3 },
      { address: "0x00000000000000000000000000000000000000bb", netProfit: -2_500_000n, betCount: 3, winCount: 1 },
    ]);
    const { router } = renderApp("/leaderboard");
    const table = await screen.findByRole("table");
    expect(router.state.location.pathname).toBe("/leaderboard");
    expect(b.leaderboard).toHaveBeenCalled();
    expect(within(table).getByRole("columnheader", { name: UI.leaderboard.profit })).toBeTruthy();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["1", "0x0000…00aa", "+12.50", "4", "3"],
      ["2", "0x0000…00bb", "-2.50", "3", "1"],
    ]);
  });

  test("no rows shows the empty state", async () => {
    renderApp("/leaderboard");
    expect(await screen.findByText(UI.leaderboard.empty)).toBeTruthy();
  });

  test("Envio failure shows the COPY error state with retry, page still renders", async () => {
    b.leaderboard.mockRejectedValue(new Error("indexer HTTP 502"));
    renderApp("/leaderboard");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(COPY.errors.INDEXER_OFFLINE);
    expect(screen.getByRole("heading", { name: UI.leaderboard.title })).toBeTruthy();
    b.leaderboard.mockResolvedValue([]);
    within(alert).getByRole("button", { name: COPY.actions.retry }).click();
    expect(await screen.findByText(UI.leaderboard.empty)).toBeTruthy();
  });
});

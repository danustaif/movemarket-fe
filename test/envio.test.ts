import { describe, expect, test } from "bun:test";
import type { IndexedMarket, IndexedPosition } from "@movemarket/shared";
import { createIndexerClient, positionFromIndexed } from "../src/lib/envio.ts";

const market = (o: Partial<IndexedMarket> = {}): IndexedMarket => ({
  id: "12", gameRef: "lichess:game:abcdefgh", marketType: 0, side: 0, fromPly: 33, toPly: 36, lockTime: "1000",
  resolveDeadline: "22600", status: "RESOLVED", outcome: 1, voidReason: null,
  poolYes: "40000000", poolNo: "60000000", resolvedTx: null, ...o,
});
const pos = (o: Partial<IndexedPosition> = {}, m: Partial<IndexedMarket> = {}): IndexedPosition => ({
  id: "12-0xaa", stakeYes: "10000000", stakeNo: "0", payout: "0", settled: false, market: market(m), ...o,
});

describe("positionFromIndexed", () => {
  test("maps to domain Position with bigint and status code", () => {
    expect(positionFromIndexed(pos())).toMatchObject({
      marketId: 12n, gameRef: "lichess:game:abcdefgh", stakeYes: 10_000_000n, stakeNo: 0n,
      status: 1, outcome: 1, resolveDeadline: 22600, settled: false,
    });
  });
  test("claimable estimate follows CONTRACTS.md example (YES 10 of 40, NO 60, fee 2%) = 24.5 tUSDC", () => {
    expect(positionFromIndexed(pos()).claimable).toBe(24_500_000n);
  });
  test("loser, settled, open, or voided -> 0", () => {
    expect(positionFromIndexed(pos({ stakeYes: "0", stakeNo: "60000000" })).claimable).toBe(0n);
    expect(positionFromIndexed(pos({ settled: true })).claimable).toBe(0n);
    expect(positionFromIndexed(pos({}, { status: "OPEN", outcome: 0 })).claimable).toBe(0n);
    expect(positionFromIndexed(pos({}, { status: "VOIDED", outcome: 3 })).status).toBe(2);
  });
  test("carries the market void reason", () => {
    expect(positionFromIndexed(pos({}, { status: "VOIDED", outcome: 3, voidReason: 2 })).voidReason).toBe(2);
    expect(positionFromIndexed(pos()).voidReason).toBeNull();
  });
  test("carries the indexed CRE report tx (resolvedTx) as finalTx", () => {
    expect(positionFromIndexed(pos({}, { resolvedTx: "0xfeed" })).finalTx).toBe("0xfeed");
    expect(positionFromIndexed(pos()).finalTx).toBeNull();
  });
});

describe("IndexerClient", () => {
  test("empty endpoint throws so callers fall back to the resolver", async () => {
    await expect(createIndexerClient("").positions("0xAA00000000000000000000000000000000000000")).rejects.toThrow();
  });
  test("positions queries by lowercase user and returns rows", async () => {
    let sent: { query: string; variables: { user: string } } | undefined;
    const f = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: { Position: [pos()] } }));
    }) as unknown as typeof fetch;
    const rows = await createIndexerClient("http://envio/v1/graphql", f).positions("0xAA00000000000000000000000000000000000000");
    expect(sent!.variables.user).toBe("0xaa00000000000000000000000000000000000000");
    expect(sent!.query).toContain("MyPositions");
    expect(rows).toHaveLength(1);
  });
  test("leaderboard converts netProfit to bigint at the boundary", async () => {
    const f = (async () => new Response(JSON.stringify({ data: { User: [{ id: "0xaa", netProfit: "-2500000", betCount: 3, winCount: 1 }] } }))) as unknown as typeof fetch;
    expect(await createIndexerClient("http://envio", f).leaderboard()).toEqual([{ address: "0xaa", netProfit: -2_500_000n, betCount: 3, winCount: 1 }]);
  });
  test("GraphQL errors throw", async () => {
    const f = (async () => new Response(JSON.stringify({ errors: [{ message: "bad" }] }))) as unknown as typeof fetch;
    await expect(createIndexerClient("http://envio", f).leaderboard()).rejects.toThrow("bad");
  });
});

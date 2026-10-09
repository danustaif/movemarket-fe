import { describe, expect, test } from "bun:test";
import { createResolverClient, ResolverError } from "../src/lib/resolver.ts";

type Call = { url: string; init?: RequestInit };
function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const gameRef = "lichess:study:AbCd1234:EfGh5678";

describe("ResolverClient", () => {
  test("game() encodes gameRef and converts DecimalString to bigint", async () => {
    const calls: Call[] = [];
    const body = {
      game: { gameRef, source: "broadcast", isReplay: false, speed: "classical", white: { name: "A" }, black: { name: "B" },
        ply: 30, fen: "x", ended: false, openMarkets: 1, sans: ["e4"] },
      markets: [{ id: "123", marketType: 0, side: 0, fromPly: 33, toPly: 36, lockTime: 1790000000, resolveDeadline: 1790021600,
        question: "q", poolYes: "12000000", poolNo: "5000000", provisional: null, final: null, voidReason: null }],
    };
    const g = await createResolverClient("http://r:8787/", fakeFetch(200, body, calls)).game(gameRef);
    expect(calls[0]!.url).toBe("http://r:8787/games/lichess%3Astudy%3AAbCd1234%3AEfGh5678");
    expect(g.game.sans).toEqual(["e4"]);
    expect(g.markets[0]).toMatchObject({ id: 123n, gameRef, poolYes: 12_000_000n, poolNo: 5_000_000n, lockTime: 1790000000 });
  });

  test("positions() converts amounts to bigint", async () => {
    const body = { positions: [{ marketId: "123", gameRef, stakeYes: "5000000", stakeNo: "0", status: 1, outcome: 1,
      resolveDeadline: 1790021600, settled: false, claimable: "9800000", voidReason: null }] };
    const [p] = await createResolverClient("http://r", fakeFetch(200, body)).positions("0x00000000000000000000000000000000000000aa");
    expect(p).toEqual({ marketId: 123n, gameRef, stakeYes: 5_000_000n, stakeNo: 0n, status: 1, outcome: 1,
      resolveDeadline: 1790021600, settled: false, claimable: 9_800_000n, voidReason: null });
  });

  test("faucet() POSTs the address as JSON", async () => {
    const calls: Call[] = [];
    const res = await createResolverClient("http://r", fakeFetch(200, { usdcTx: "0x01", monTx: null }, calls))
      .faucet("0x00000000000000000000000000000000000000aa");
    expect(res).toEqual({ usdcTx: "0x01", monTx: null });
    expect(calls[0]!.url).toBe("http://r/faucet");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ address: "0x00000000000000000000000000000000000000aa" });
  });

  test("non-2xx throws ResolverError with status and ApiError.code", async () => {
    const c = createResolverClient("http://r", fakeFetch(429, { error: "limit", code: "GAS_TOPUP_LIMIT" }));
    const err = await c.faucetGas("0x00000000000000000000000000000000000000aa").catch((e) => e);
    expect(err).toBeInstanceOf(ResolverError);
    expect(err).toMatchObject({ status: 429, code: "GAS_TOPUP_LIMIT" });
  });

  test("network failure throws ResolverError RESOLVER_OFFLINE", async () => {
    const c = createResolverClient("http://r", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    expect(await c.games().catch((e) => e)).toMatchObject({ status: 0, code: "RESOLVER_OFFLINE" });
  });
});

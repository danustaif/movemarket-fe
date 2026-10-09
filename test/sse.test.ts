import { describe, expect, test } from "bun:test";
import type { GameSummary, MarketDto } from "@movemarket/shared";
import type { Game } from "../src/contracts/data.ts";
import { applyToGames, sseReducers as r } from "../src/lib/sse.ts";

const gameRef = "lichess:game:abcdefgh";
const dto = (id: string, o: Partial<MarketDto> = {}): MarketDto => ({
  id, marketType: 0, side: 0, fromPly: 33, toPly: 36, lockTime: 1000, resolveDeadline: 22600, question: "q",
  poolYes: "0", poolNo: "0", provisional: null, final: null, voidReason: null, ...o,
});
const game = (): Game => ({
  game: { gameRef, source: "replay", isReplay: true, speed: "classical", white: { name: "A" }, black: { name: "B" },
    ply: 2, fen: "f2", ended: false, openMarkets: 1, sans: ["e4", "e5"] },
  markets: [{ ...dto("7"), id: 7n, gameRef, poolYes: 0n, poolNo: 0n }],
});

describe("sseReducers", () => {
  test("ply appends the next san, replaces fen and ply", () => {
    const g = r.ply(game(), { gameRef, ply: 3, san: "Nf3", fen: "f3", isReplay: true, at: 1 })!;
    expect(g.game).toMatchObject({ ply: 3, fen: "f3", sans: ["e4", "e5", "Nf3"] });
  });
  test("ply correction truncates sans", () => {
    const g = r.ply(game(), { gameRef, ply: 2, san: "c5", fen: "x", isReplay: true, at: 1 })!;
    expect(g.game.sans).toEqual(["e4", "c5"]);
  });
  test("ply gap keeps sans (bridge refetches) but updates ply and fen", () => {
    const g = r.ply(game(), { gameRef, ply: 5, san: "Bc4", fen: "f5", isReplay: true, at: 1 })!;
    expect(g.game).toMatchObject({ ply: 5, fen: "f5", sans: ["e4", "e5"] });
  });
  test("no cached game stays undefined", () => {
    expect(r.pool(undefined, { gameRef, marketId: "7", poolYes: "1", poolNo: "2" })).toBeUndefined();
  });
  test("game_end sets ended and result", () => {
    expect(r.game_end(game(), { gameRef, result: "1-0" })!.game).toMatchObject({ ended: true, result: "1-0" });
  });
  test("market_created adds new markets as bigint, skips known ids", () => {
    const g = r.market_created(game(), { gameRef, markets: [dto("7"), dto("8", { poolYes: "5000000" })] })!;
    expect(g.markets.map((m) => m.id)).toEqual([7n, 8n]);
    expect(g.markets[1]).toMatchObject({ gameRef, poolYes: 5_000_000n });
  });
  test("market_locked only moves lockTime earlier", () => {
    expect(r.market_locked(game(), { gameRef, marketIds: ["7"], lockTime: 990 })!.markets[0]!.lockTime).toBe(990);
    expect(r.market_locked(game(), { gameRef, marketIds: ["7"], lockTime: 1200 })!.markets[0]!.lockTime).toBe(1000);
  });
  test("pool sets pools as bigint", () => {
    const m = r.pool(game(), { gameRef, marketId: "7", poolYes: "12000000", poolNo: "5000000" })!.markets[0]!;
    expect([m.poolYes, m.poolNo]).toEqual([12_000_000n, 5_000_000n]);
  });
  test("provisional and finalized", () => {
    const p = r.provisional(game(), { gameRef, marketId: "7", outcome: "YES" })!;
    expect(p.markets[0]!.provisional).toBe("YES");
    const f = r.finalized(p, { gameRef, marketId: "7", outcome: "VOID", voidReason: 2, txHash: "0x01" })!;
    expect(f.markets[0]).toMatchObject({ provisional: "YES", final: "VOID", voidReason: 2 });
  });
  test("events for other markets leave the game untouched", () => {
    const g = game();
    expect(r.pool(g, { gameRef, marketId: "99", poolYes: "1", poolNo: "1" })!.markets).toEqual(g.markets);
  });
});

describe("applyToGames", () => {
  const list = (): GameSummary[] => [{ ...game().game }];
  test("ply updates the summary", () => {
    expect(applyToGames(list(), "ply", { gameRef, ply: 3, san: "Nf3", fen: "f3", isReplay: true, at: 1 })[0])
      .toMatchObject({ ply: 3, fen: "f3" });
  });
  test("game_end updates the summary", () => {
    expect(applyToGames(list(), "game_end", { gameRef, result: "0-1" })[0]).toMatchObject({ ended: true, result: "0-1" });
  });
});

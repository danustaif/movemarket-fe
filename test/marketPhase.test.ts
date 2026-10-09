import { describe, expect, test } from "bun:test";
import type { Market, Position } from "../src/contracts/data.ts";
import { deriveMarketPhase, positionPhase } from "../src/lib/marketPhase.ts";

// lockMarginSec = 1 (SOT.frontend.lockMarginSec)
const base: Market = {
  id: 7n, gameRef: "lichess:game:abcdefgh", marketType: 0, side: 0, fromPly: 33, toPly: 36,
  lockTime: 1000, resolveDeadline: 22600, question: "Any check in plies 33 to 36 (moves 17 to 18)?",
  poolYes: 5_000_000n, poolNo: 2_000_000n, provisional: null, final: null, voidReason: null,
};
const m = (o: Partial<Market>): Market => ({ ...base, ...o });

describe("deriveMarketPhase", () => {
  test("open with countdown before lockTime - margin", () => {
    expect(deriveMarketPhase(base, 30, 988)).toEqual({ phase: "open", secondsLeft: 12 });
  });
  test("locked inside the 1 s margin", () => {
    expect(deriveMarketPhase(base, 30, 999)).toEqual({ phase: "locked" });
  });
  test("locked after lockTime while fromPly not reached", () => {
    expect(deriveMarketPhase(base, 32, 1005)).toEqual({ phase: "locked" });
  });
  test("waiting once the ply range is being played", () => {
    expect(deriveMarketPhase(base, 33, 1005)).toEqual({ phase: "waiting", toPly: 36 });
  });
  test("noStakes when locked with empty pools", () => {
    expect(deriveMarketPhase(m({ poolYes: 0n, poolNo: 0n }), 34, 1005)).toEqual({ phase: "noStakes" });
  });
  test("empty pools still open before lock", () => {
    expect(deriveMarketPhase(m({ poolYes: 0n, poolNo: 0n }), 30, 990).phase).toBe("open");
  });
  test("provisional outcome", () => {
    expect(deriveMarketPhase(m({ provisional: "YES" }), 36, 1100)).toEqual({ phase: "provisional", outcome: "YES" });
  });
  test("final YES/NO wins over provisional", () => {
    expect(deriveMarketPhase(m({ provisional: "YES", final: "NO" }), 40, 1100)).toEqual({ phase: "final", outcome: "NO" });
  });
  test("final VOID is voided with reason (NO_WINNERS = 2)", () => {
    expect(deriveMarketPhase(m({ final: "VOID", voidReason: 2 }), 40, 1100)).toEqual({ phase: "voided", reason: 2 });
  });
  test("expired past resolveDeadline without final, even if provisional", () => {
    expect(deriveMarketPhase(m({ provisional: "NO" }), 40, 22601)).toEqual({ phase: "expired" });
  });
  test("final is not expired", () => {
    expect(deriveMarketPhase(m({ final: "YES" }), 40, 30000)).toEqual({ phase: "final", outcome: "YES" });
  });
  test("noStakes past deadline stays noStakes", () => {
    expect(deriveMarketPhase(m({ poolYes: 0n, poolNo: 0n }), 40, 30000)).toEqual({ phase: "noStakes" });
  });
});

describe("positionPhase", () => {
  const pos = (o: Partial<Position>): Position => ({
    marketId: 7n, gameRef: "lichess:game:abcdefgh", stakeYes: 1_000_000n, stakeNo: 0n, status: 0, outcome: 0,
    resolveDeadline: 22600, settled: false, claimable: 0n, voidReason: null, ...o,
  });
  test("VOIDED keeps the void reason so /me can say \"no winning stakes\"", () => {
    expect(positionPhase(pos({ status: 2, outcome: 3, voidReason: 2 }), 1000)).toEqual({ phase: "voided", reason: 2 });
  });
  test("RESOLVED -> final outcome", () => {
    expect(positionPhase(pos({ status: 1, outcome: 2 }), 1000)).toEqual({ phase: "final", outcome: "NO" });
  });
});

// Fase pasar untuk label dan tombol (USER_FLOW.md bagian 5). Fungsi murni.
import { ENUMS, SOT } from "@movemarket/shared";
import type { VoidReasonCode } from "@movemarket/shared";
import type { DeriveMarketPhase, MarketPhase, Position } from "../contracts/data.ts";

type Phase = MarketPhase["phase"];
/** Terkunci dan menunggu hasil: bagian "In play" di layar partai. */
export const IN_PLAY: ReadonlySet<Phase> = new Set(["locked", "waiting", "provisional"]);
/** Selesai (bagian "Results"): kartu ringkas dengan latar deep. */
export const SETTLED: ReadonlySet<Phase> = new Set(["final", "voided", "expired", "noStakes"]);
/** Fase yang mengembalikan stake lewat refund. */
export const REFUNDABLE: ReadonlySet<Phase> = new Set(["voided", "expired"]);

/** Di bawah SOT.frontend.closingSoonSec chip Open dan hitung mundur berubah coral. */
export const isClosingSoon = (secondsLeft: number) => secondsLeft <= SOT.frontend.closingSoonSec;

const VOID_NO_WINNERS = Number(Object.entries(ENUMS.VoidReason).find(([, n]) => n === "NO_WINNERS")![0]);
/** VOID karena pool pemenang kosong (label "Voided: no winning stakes"). */
export const isNoWinners = (reason: VoidReasonCode | null) => reason === VOID_NO_WINNERS;

export const deriveMarketPhase: DeriveMarketPhase = (market, currentPly, nowSec) => {
  const { final, provisional } = market;
  if (final === "VOID") return { phase: "voided", reason: market.voidReason };
  if (final) return { phase: "final", outcome: final };
  if (nowSec < market.lockTime - SOT.frontend.lockMarginSec) {
    return { phase: "open", secondsLeft: Math.max(0, Math.floor(market.lockTime - nowSec)) };
  }
  // Pasar tanpa stake tidak pernah di-request (D18), jadi tidak ada yang perlu di-refund.
  if (market.poolYes === 0n && market.poolNo === 0n) return { phase: "noStakes" };
  // Kontrak mengizinkan refund begitu lewat resolveDeadline tanpa report, apa pun hasil sementaranya.
  if (nowSec > market.resolveDeadline) return { phase: "expired" };
  if (provisional) return { phase: "provisional", outcome: provisional };
  if (currentPly >= market.fromPly) return { phase: "waiting", toPly: market.toPly };
  return { phase: "locked" };
};

/** Fase untuk baris /me, dari status on-chain posisi (tanpa pool dan ply). */
export function positionPhase(p: Position, nowSec: number): MarketPhase {
  const status = ENUMS.Status[p.status];
  if (status === "RESOLVED") return { phase: "final", outcome: p.outcome === 1 ? "YES" : "NO" };
  if (status === "VOIDED") return { phase: "voided", reason: p.voidReason };
  if (nowSec > p.resolveDeadline) return { phase: "expired" };
  return { phase: "locked" };
}

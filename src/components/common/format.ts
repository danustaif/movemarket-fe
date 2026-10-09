// Format tampilan. Nominal selalu bigint 6 desimal (SOT.token.decimals); persen dan odds dihitung dengan bigint.
import { COPY, SOT } from "@movemarket/shared";
import { formatUnits, parseUnits } from "viem";

const DEC = SOT.token.decimals;
export const SYMBOL = SOT.token.symbol;

/** 12500000n -> "12.50". Dua desimal minimum, sampai `maxFrac` (default 6, jadi 0.000001 tetap terlihat). Dipotong, tidak dibulatkan. */
export function usdc(v: bigint, maxFrac = 6): string {
  const [int, frac = ""] = formatUnits(v, DEC).split(".");
  const f = frac.slice(0, maxFrac).replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(int).toLocaleString("en-US")}.${f}`;
}

/** Saldo native (MON, desimal dari viem chain) dipotong ke 4 desimal: 512345678900000000n -> "0.5123". */
export function native(v: bigint, decimals: number): string {
  const [int, frac = ""] = formatUnits(v, decimals).split(".");
  return `${BigInt(int).toLocaleString("en-US")}.${frac.slice(0, 4).padEnd(2, "0")}`;
}

/** Nominal yang mungkin belum termuat (saldo): COPY.ui.generic.noValue sampai ada. */
export const usdcOrDash = (v: bigint | undefined): string => (v === undefined ? COPY.ui.generic.noValue : usdc(v));

/** Input pengguna -> bigint, null kalau bukan angka positif yang valid. */
export function parseUsdc(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(t)) return null;
  return parseUnits(t, DEC);
}

/** Persentase sisi YES (0..100, dibulatkan), null kalau pool kosong. */
export function yesPct(poolYes: bigint, poolNo: bigint): number | null {
  const total = poolYes + poolNo;
  if (total === 0n) return null;
  return Number((poolYes * 100n + total / 2n) / total);
}

/** Penyebut basis poin. */
export const BPS = 10_000n;

/** Fee (bps) yang berlaku: hanya dipotong kalau kedua sisi punya stake (rumus kontrak `_payout`). */
export const appliedFeeBps = (a: bigint, b: bigint, feeBps: number): bigint => (a > 0n && b > 0n ? BigInt(feeBps) : 0n);

/** Odds tersirat (poolYes+poolNo)*(1-fee)/poolSisi, "x2.88"; "-" kalau pool sisi 0. */
export function odds(side: bigint, other: bigint, feeBps: number): string {
  if (side === 0n) return "-";
  const x100 = ((side + other) * (BPS - appliedFeeBps(side, other, feeBps)) * 100n) / (BPS * side);
  return `x${x100 / 100n}.${String(x100 % 100n).padStart(2, "0")}`;
}

/** Perkiraan payout kalau menang dengan stake `amount` di sisi `side` pada pool saat ini. */
export function payout(amount: bigint, side: bigint, other: bigint, feeBps: number): bigint {
  if (amount <= 0n) return 0n;
  const s = side + amount;
  return ((s + other) * (BPS - appliedFeeBps(s, other, feeBps)) * amount) / (BPS * s);
}

/** 72 -> "1:12". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

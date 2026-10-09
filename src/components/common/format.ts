// Format tampilan. Nominal selalu bigint 6 desimal (SOT.token.decimals); persen dan odds dihitung dengan bigint.
import { SOT } from "@movemarket/shared";
import { formatUnits, parseUnits } from "viem";

const DEC = SOT.token.decimals;
export const SYMBOL = SOT.token.symbol;

/** 12500000n -> "12.50". Dua desimal minimum, sampai enam kalau perlu (0.000001 tetap terlihat). */
export function usdc(v: bigint): string {
  const [int, frac = ""] = formatUnits(v, DEC).split(".");
  const f = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(int).toLocaleString("en-US")}.${f}`;
}

/** Input pengguna -> bigint, null kalau bukan angka positif yang valid. */
export function parseUsdc(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(t)) return null;
  return parseUnits(t, DEC);
}

export const usdcUnits = (whole: number): bigint => parseUnits(String(whole), DEC);

/** Persentase sisi YES (0..100, dibulatkan), null kalau pool kosong. */
export function yesPct(poolYes: bigint, poolNo: bigint): number | null {
  const total = poolYes + poolNo;
  if (total === 0n) return null;
  return Number((poolYes * 100n + total / 2n) / total);
}

/** Fee hanya dipotong kalau kedua sisi punya stake (PRODUCT.md). */
const feeFor = (a: bigint, b: bigint, feeBps: number) => (a > 0n && b > 0n ? BigInt(feeBps) : 0n);

/** Odds tersirat (poolYes+poolNo)*(1-fee)/poolSisi, "x2.88"; "-" kalau pool sisi 0. */
export function odds(side: bigint, other: bigint, feeBps: number): string {
  if (side === 0n) return "-";
  const x100 = ((side + other) * (10000n - feeFor(side, other, feeBps)) * 100n) / (10000n * side);
  return `x${x100 / 100n}.${String(x100 % 100n).padStart(2, "0")}`;
}

/** Perkiraan payout kalau menang dengan stake `amount` di sisi `side` pada pool saat ini. */
export function payout(amount: bigint, side: bigint, other: bigint, feeBps: number): bigint {
  if (amount <= 0n) return 0n;
  const s = side + amount;
  return ((s + other) * (10000n - feeFor(s, other, feeBps)) * amount) / (10000n * s);
}

/** 72 -> "1:12". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

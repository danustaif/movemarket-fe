// Waktu chain (FRONTEND.md bagian 7): offset dari blok terbaru, Countdown memakai nowSec(), bukan Date.now().
import type { PublicClient } from "viem";
import type { ChainClock } from "../contracts/data.ts";

/** offsetSec = block.timestamp - floor(Date.now()/1000) dari blok terbaru. */
export async function fetchChainOffset(client: Pick<PublicClient, "getBlock">, nowMs: () => number = Date.now): Promise<number> {
  const block = await client.getBlock({ blockTag: "latest" });
  return Number(block.timestamp) - Math.floor(nowMs() / 1000);
}

let offsetSec = 0;

/** Offset diperbarui oleh useChainTime tiap SOT.frontend.chainTimeRefreshSec. */
export const chainClock: ChainClock & { setOffset(sec: number): void } = {
  nowSec: () => Date.now() / 1000 + offsetSec,
  setOffset(sec) {
    offsetSec = sec;
  },
};

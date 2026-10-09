import type { CountdownProps } from "../../contracts/ui.ts";
import { clock } from "../common/format.ts";

/** Sisa waktu sampai lockTime, dari waktu chain (nowSec), bukan Date.now(). */
export function Countdown({ lockTime, nowSec }: CountdownProps) {
  return <span role="timer" className="tabular-nums">{clock(lockTime - nowSec)}</span>;
}

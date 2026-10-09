// Self-check format: `bun src/components/common/format.check.ts`. Tidak diimpor aplikasi.
import { clock, odds, parseUsdc, payout, usdc, yesPct } from "./format.ts";

const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
ok(usdc(12_500_000n) === "12.50", "usdc");
ok(usdc(1n) === "0.000001", "usdc tiny");
ok(usdc(1_234_000_000n) === "1,234.00", "usdc grouping");
ok(usdc(1_480_232n, 2) === "1.48", "usdc maxFrac");
ok(parseUsdc("5.5") === 5_500_000n && parseUsdc("abc") === null && parseUsdc("1.1234567") === null, "parse");
ok(odds(100n, 300n, 200) === "x3.92", "odds");
ok(odds(0n, 300n, 200) === "-" && odds(100n, 0n, 200) === "x1.00", "odds edge");
ok(yesPct(1n, 3n) === 25 && yesPct(0n, 0n) === null, "pct");
ok(payout(100n, 0n, 300n, 200) === 392n, "payout");
ok(clock(72) === "1:12" && clock(-3) === "0:00", "clock");
console.log("format ok");

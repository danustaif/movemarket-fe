// Self-check: `bun src/components/board/lastMove.check.ts`. Tidak diimpor aplikasi.
import { lastMove } from "./lastMove.ts";

const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
ok(JSON.stringify(lastMove(start, e4, "e4", 1)) === '{"from":"e2","to":"e4"}', "diff e4");
const pre = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
const oo = "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1";
ok(JSON.stringify(lastMove(pre, oo, "O-O", 1)) === '{"from":"e1","to":"g1"}', "castle");
ok(JSON.stringify(lastMove(undefined, oo, "O-O", 2)) === '{"from":"g8","to":"g8"}', "san fallback black");
ok(lastMove(undefined, start, undefined, 0) === undefined, "none");
console.log("lastMove ok");

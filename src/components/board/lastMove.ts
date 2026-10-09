// Langkah terakhir untuk sorotan papan, tanpa chess.js: diff dua FEN, cadangan petak tujuan dari SAN.
const FILES = "abcdefgh";

/** Bagian penempatan FEN -> 64 petak, indeks 0 = a8, 63 = h1. "" = kosong. */
function squares(fen: string): string[] {
  const out: string[] = [];
  for (const ch of fen.split(" ")[0]) {
    if (ch === "/") continue;
    if (/\d/.test(ch)) out.push(...Array<string>(Number(ch)).fill(""));
    else out.push(ch);
  }
  return out;
}
const name = (i: number) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;

/** Petak tujuan dari SAN ("Nxe5+", "O-O"). `whiteMoved` menentukan baris rokade. */
export function toSquareFromSan(san: string, whiteMoved: boolean): string | null {
  const rank = whiteMoved ? "1" : "8";
  if (san.startsWith("O-O-O")) return `c${rank}`;
  if (san.startsWith("O-O")) return `g${rank}`;
  const m = san.match(/[a-h][1-8]/g);
  return m ? m[m.length - 1] : null;
}

/**
 * Diff prev -> next. Satu langkah normal: satu petak dikosongkan, satu terisi. Rokade dan en passant
 * mengubah lebih banyak petak; tujuan diutamakan petak raja, asal = petak yang dulu berisi bidak yang sama.
 * ponytail: kalau beberapa ply terlewat (reconnect) hasilnya bisa kurang tepat; cukup untuk sorotan.
 */
export function lastMove(prevFen: string | undefined, fen: string, lastSan: string | undefined, ply: number): { from: string; to: string } | undefined {
  if (prevFen && prevFen !== fen) {
    const a = squares(prevFen), b = squares(fen);
    const filled: number[] = [], emptied: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (a[i] === b[i]) continue;
      if (b[i]) filled.push(i); else emptied.push(i);
    }
    const to = filled.find((i) => /k/i.test(b[i])) ?? filled[0];
    if (to !== undefined) {
      const from = emptied.find((i) => a[i] === b[to]) ?? emptied[0];
      if (from !== undefined) return { from: name(from), to: name(to) };
    }
  }
  const to = lastSan ? toSquareFromSan(lastSan, ply % 2 === 1) : null;
  return to ? { from: to, to } : undefined;
}

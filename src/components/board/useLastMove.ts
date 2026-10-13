// Langkah terakhir untuk sorotan papan: simpan FEN sebelumnya (disesuaikan saat render, tanpa effect).
import { useState } from "react";
import { lastMove } from "./lastMove.ts";

export function useLastMove(fen: string | undefined, lastSan: string | undefined, ply: number) {
  const [fens, setFens] = useState<{ cur?: string; prev?: string }>({ cur: fen });
  if (fen !== fens.cur) setFens({ cur: fen, prev: fens.cur });
  return fen ? lastMove(fens.prev, fen, lastSan, ply) : undefined;
}

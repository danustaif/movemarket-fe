// Papan 3D (chunk lazy terpisah bersama three.js, dimuat lewat BoardSurface). Mengisi ukuran induknya.
// Kanvas aria-hidden; nama aksesibel (ply dan langkah terakhir) ada di pembungkus yang bisa difokus.
import { useEffect, useRef, useState } from "react";
import { UI, fill } from "../common/copy.ts";
import { pieceMap } from "./lastMove.ts";
import { createBoardScene, type BoardScene, type SceneOptions } from "./scene3d.ts";

export interface Board3DProps {
  fen: string;
  ply: number;
  lastMove?: { from: string; to: string };
  /** Teks aksesibel papan, mis. "3D board at ply 31. Last exf5." */
  label: string;
  scene?: Pick<SceneOptions, "dist" | "offset" | "offsetNarrow" | "elev" | "fit">;
  /** Petunjuk dan tombol reset di sudut papan (layar partai). Landing memakai petunjuknya sendiri. */
  controls?: boolean;
  /** WebGL gagal dibuat: pemanggil menampilkan papan 2D. */
  onFail(): void;
}

const KEYS: Record<string, [number, number]> = { ArrowLeft: [0.18, 0], ArrowRight: [-0.18, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };

export default function Board3D({ fen, ply, lastMove, label, scene: sceneOpts, controls, onFail }: Board3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const shown = useRef<{ fen?: string; ply?: number }>({});
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    if (!canvas.current) return;
    try {
      scene.current = createBoardScene(canvas.current, {
        ...sceneOpts,
        reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
        onPick: (square, x, y) => {
          if (!square) return setTip(null);
          const piece = pieceMap(fenRef.current)[square];
          setTip({ text: piece ? fill(UI.board.square, { square, piece: UI.board.pieces[piece as keyof typeof UI.board.pieces] }) : square, x, y });
        },
      });
    } catch {
      failRef.current();
      return;
    }
    shown.current = {};
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // Scene dibuat sekali per kanvas; opsi kamera tidak berubah selama papan terpasang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = scene.current;
    if (!s || shown.current.fen === fen) return;
    const prev = shown.current.ply;
    s.setPosition(fen, lastMove, prev !== undefined && ply === prev + 1);
    shown.current = { fen, ply };
  }, [fen, ply, lastMove]);

  return (
    <div
      role="group" aria-label={label} tabIndex={0}
      className="relative h-full w-full select-none"
      onKeyDown={(e) => {
        const k = KEYS[e.key];
        if (k) scene.current?.nudge(k[0], k[1]);
        else if (e.key === "Home") scene.current?.reset();
        else return;
        e.preventDefault();
      }}
    >
      <canvas ref={canvas} aria-hidden="true" className="block h-full w-full" />
      {tip && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-control bg-control px-2 py-1 text-[13px] font-bold whitespace-nowrap text-white shadow-[0_6px_16px_rgb(0_0_0/.3)]"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </span>
      )}
      {controls && (
        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <span aria-hidden="true" className="pointer-events-none hidden text-xs font-semibold text-muted sm:block">{UI.board.turnHint}</span>
          <button type="button" className="btn dark sm ml-auto" onClick={() => scene.current?.reset()}>{UI.board.reset}</button>
        </div>
      )}
    </div>
  );
}

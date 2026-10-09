// SSE resolver ke cache TanStack Query (FRONTEND.md bagian 6).
import { SOT, SSE_EVENTS, type GameSummary, type SseEvents } from "@movemarket/shared";
import type { QueryClient } from "@tanstack/react-query";
import { qk, type Game, type Market, type SseBridge, type SseReducers } from "../contracts/data.ts";
import { toMarket } from "./resolver.ts";

type SseStatus = ReturnType<SseBridge["status"]>;

const mapMarket = (g: Game, id: string, f: (m: Market) => Market): Game => {
  const bid = BigInt(id);
  return { ...g, markets: g.markets.map((m) => (m.id === bid ? f(m) : m)) };
};

export const sseReducers: SseReducers = {
  ply: (g, d) => {
    if (!g) return g;
    const { sans } = g.game;
    // ply berikutnya: tambah; ply <= panjang sans: koreksi langkah; loncat: sans dibiarkan, bridge refetch.
    const next = d.ply <= sans.length + 1 ? [...sans.slice(0, d.ply - 1), d.san] : sans;
    return { ...g, game: { ...g.game, ply: d.ply, fen: d.fen, isReplay: d.isReplay, sans: next } };
  },
  game_end: (g, d) => g && { ...g, game: { ...g.game, ended: true, result: d.result } },
  market_created: (g, d) => {
    if (!g) return g;
    const known = new Set(g.markets.map((m) => m.id));
    const added = d.markets.map((m) => toMarket(m, d.gameRef)).filter((m) => !known.has(m.id));
    return { ...g, markets: [...g.markets, ...added] };
  },
  market_locked: (g, d) => {
    if (!g) return g;
    const ids = new Set(d.marketIds.map(BigInt));
    // lockMarkets hanya memajukan lockTime (SOT contract.rules).
    return { ...g, markets: g.markets.map((m) => (ids.has(m.id) ? { ...m, lockTime: Math.min(m.lockTime, d.lockTime) } : m)) };
  },
  pool: (g, d) => g && mapMarket(g, d.marketId, (m) => ({ ...m, poolYes: BigInt(d.poolYes), poolNo: BigInt(d.poolNo) })),
  provisional: (g, d) => g && mapMarket(g, d.marketId, (m) => ({ ...m, provisional: d.outcome })),
  finalized: (g, d) => g && mapMarket(g, d.marketId, (m) => ({ ...m, final: d.outcome, voidReason: d.voidReason })),
  replay_starting: (g) => g,
  ping: (g) => g,
};

/** Ringkasan di qk.games(): hanya ply dan game_end yang mengubahnya; sisanya lewat invalidate. */
export function applyToGames<E extends keyof SseEvents>(list: GameSummary[], event: E, data: SseEvents[E]): GameSummary[] {
  if (event === "ply") {
    const d = data as SseEvents["ply"];
    return list.map((s) => (s.gameRef === d.gameRef ? { ...s, ply: d.ply, fen: d.fen } : s));
  }
  if (event === "game_end") {
    const d = data as SseEvents["game_end"];
    return list.map((s) => (s.gameRef === d.gameRef ? { ...s, ended: true, result: d.result } : s));
  }
  return list;
}

const INVALIDATE_GAMES: ReadonlySet<keyof SseEvents> = new Set(["market_created", "market_locked", "game_end", "replay_starting"]);

export interface SseBridgeDeps {
  baseUrl: string;
  queryClient: QueryClient;
  /** Alamat akun aktif, untuk invalidate posisi saat finalized. */
  getAddress: () => string | undefined;
  onStatus?: (s: SseStatus) => void;
  onReplayStarting?: (gameRef: string) => void;
  EventSourceImpl?: typeof EventSource;
}

export function createSseBridge(deps: SseBridgeDeps): SseBridge {
  const { queryClient: qc } = deps;
  let status: SseStatus = "closed";
  const setStatus = (s: SseStatus) => {
    status = s;
    deps.onStatus?.(s);
  };

  function handle<E extends keyof SseEvents>(event: E, data: SseEvents[E]) {
    if ("gameRef" in data) {
      const key = qk.game(data.gameRef);
      const reduce = sseReducers[event] as (g: Game | undefined, d: SseEvents[E]) => Game | undefined;
      qc.setQueryData<Game>(key, (g) => reduce(g, data));
      const g = qc.getQueryData<Game>(key);
      if (event === "ply" && g && g.game.sans.length !== g.game.ply) void qc.invalidateQueries({ queryKey: key });
      if (event === "replay_starting") deps.onReplayStarting?.(data.gameRef);
    }
    qc.setQueryData<GameSummary[]>(qk.games(), (l) => l && applyToGames(l, event, data));
    if (INVALIDATE_GAMES.has(event)) void qc.invalidateQueries({ queryKey: qk.games() });
    const addr = deps.getAddress();
    if (event === "finalized" && addr) {
      void qc.invalidateQueries({ queryKey: qk.positions(addr) });
      void qc.invalidateQueries({ queryKey: ["payouts", addr.toLowerCase()] });
    }
  }

  return {
    status: () => status,
    connect(opts) {
      const ES = deps.EventSourceImpl ?? EventSource;
      const url = `${deps.baseUrl.replace(/\/+$/, "")}/stream${opts?.gameRef ? `?gameRef=${encodeURIComponent(opts.gameRef)}` : ""}`;
      const backoff = SOT.frontend.sseBackoffSec;
      let es: EventSource | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let attempt = 0;
      let reconnecting = false;
      let stopped = false;

      const open = () => {
        es = new ES(url);
        es.onopen = () => {
          if (reconnecting) {
            // Event yang terlewat saat putus: ambil ulang daftar dan partai yang sedang dibuka (query aktif).
            void qc.invalidateQueries({ queryKey: qk.games() });
            void qc.invalidateQueries({ queryKey: ["game"] });
          }
          attempt = 0;
          reconnecting = false;
          setStatus("open");
        };
        // EventSource bawaan reconnect dengan jeda tetap; ditutup supaya backoff mengikuti SOT.
        es.onerror = () => {
          es?.close();
          if (stopped) return;
          reconnecting = true;
          setStatus("reconnecting");
          timer = setTimeout(open, backoff[Math.min(attempt++, backoff.length - 1)]! * 1000);
        };
        for (const name of SSE_EVENTS) {
          es.addEventListener(name, (ev) => {
            try {
              handle(name, JSON.parse((ev as MessageEvent<string>).data));
            } catch {
              // payload rusak: abaikan satu event, state dibetulkan oleh refetch berikutnya
            }
          });
        }
      };

      open();
      return () => {
        stopped = true;
        clearTimeout(timer);
        es?.close();
        setStatus("closed");
      };
    },
  };
}

// Kontrak lapisan data frontend: model domain (bigint), klien resolver/indexer, query key, SSE ke cache.
// Spesifikasi: source/docs/FRONTEND.md bagian 4 sampai 7.
import type {
  FinalOutcome, GameDetail, GameSummary, IndexedPosition, MarketDto, PositionDto, SseEvents, VoidReasonCode,
} from "@movemarket/shared";
import type { Address, Hex } from "viem";

// ----------------------------------------------------------------- model domain
// Wire (DecimalString) diubah ke bigint hanya di ResolverClient/IndexerClient. Komponen tidak pernah
// melihat string nominal.

export type Market = Omit<MarketDto, "id" | "poolYes" | "poolNo"> & {
  id: bigint;
  gameRef: string;
  poolYes: bigint;
  poolNo: bigint;
};

export interface Game {
  game: GameDetail;
  markets: Market[];
}

export type Position = Omit<PositionDto, "marketId" | "stakeYes" | "stakeNo" | "claimable"> & {
  marketId: bigint;
  stakeYes: bigint;
  stakeNo: bigint;
  claimable: bigint;
};

// ----------------------------------------------------------------- klien

/** lib/resolver.ts. Melempar ResolverError dengan status HTTP dan ApiError.code. */
export interface ResolverClient {
  games(): Promise<GameSummary[]>;
  game(gameRef: string): Promise<Game>;
  positions(address: Address): Promise<Position[]>;
  /** Faucet onboarding. monTx null berarti hanya tUSDC yang terkirim. */
  faucet(address: Address): Promise<{ usdcTx: Hex; monTx: Hex | null }>;
  /** Isi ulang gas. 409 saldo masih cukup, 429 kuota habis (errors.GAS_TOPUP_LIMIT). */
  faucetGas(address: Address): Promise<{ monTx: Hex }>;
}

/** Baris peringkat dengan nominal bigint (LeaderboardRow wire dikonversi di lib/envio.ts). */
export interface Leader {
  address: string;
  netProfit: bigint;
  betCount: number;
  winCount: number;
}

/** lib/envio.ts. Query di backend/indexer/queries.graphql. Cadangan posisi: ResolverClient.positions. */
export interface IndexerClient {
  positions(address: Address): Promise<IndexedPosition[]>;
  leaderboard(): Promise<Leader[]>;
}

// ----------------------------------------------------------------- query key (queries/keys.ts)

export const qk = {
  games: () => ["games"] as const,
  game: (gameRef: string) => ["game", gameRef] as const,
  market: (id: string) => ["market", id] as const,
  positions: (addr: string) => ["positions", addr.toLowerCase()] as const,
  balance: (addr: string) => ["balance", addr.toLowerCase()] as const,
  allowance: (addr: string) => ["allowance", addr.toLowerCase()] as const,
  leaderboard: () => ["leaderboard"] as const,
  chainTime: () => ["chainTime"] as const,
};

// ----------------------------------------------------------------- SSE (lib/sse.ts)

/**
 * Satu EventSource ke GET /stream. Setiap event diterapkan ke cache TanStack Query sesuai tabel
 * FRONTEND.md bagian 6. Reconnect dengan backoff SOT.frontend.sseBackoffSec; setelah reconnect,
 * invalidate qk.games() dan qk.game(gameRef) yang sedang dibuka.
 */
export interface SseBridge {
  connect(opts?: { gameRef?: string }): () => void; // kembalikan fungsi disconnect
  status(): "open" | "reconnecting" | "closed";
}

/** Reducer murni per event, mudah dites tanpa EventSource. */
export type SseReducers = {
  [E in keyof SseEvents]: (game: Game | undefined, data: SseEvents[E]) => Game | undefined;
};

// ----------------------------------------------------------------- waktu chain (lib/time.ts)

export interface ChainClock {
  /** Date.now()/1000 + offset dari blok terbaru, diperbarui tiap SOT.frontend.chainTimeRefreshSec. */
  nowSec(): number;
}

// ----------------------------------------------------------------- fase pasar untuk UI

/** Label kartu pasar (USER_FLOW.md bagian 5). Key teks: copy.market.status.<phase>. */
export type MarketPhase =
  | { phase: "open"; secondsLeft: number }
  | { phase: "locked" }
  | { phase: "noStakes" }
  | { phase: "waiting"; toPly: number }
  | { phase: "provisional"; outcome: FinalOutcome }
  | { phase: "final"; outcome: Exclude<FinalOutcome, "VOID"> }
  | { phase: "voided"; reason: VoidReasonCode | null }
  | { phase: "expired" };

/**
 * Fungsi murni: satu-satunya tempat aturan label dan tombol ditentukan.
 * Stake aktif hanya saat phase "open" dan nowSec < lockTime - SOT.frontend.lockMarginSec.
 */
export type DeriveMarketPhase = (market: Market, currentPly: number, nowSec: number) => MarketPhase;

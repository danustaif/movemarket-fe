// Kontrak UI: route, hook query/mutation, dan props komponen utama. Spesifikasi: source/docs/FRONTEND.md
// bagian 2, 4, 5, 8; desain visual: source/DESIGN.md dan source/design/prototype/. Teks dari COPY.
import type { GameSummary } from "@movemarket/shared";
import type { TransactionReceipt } from "viem";
import type { Game, Market, MarketPhase, Position } from "./data.ts";

// ----------------------------------------------------------------- route (TanStack Router)

export interface Routes {
  "/": { loader: "games" };
  "/onboarding": { loader: null };
  /** gameRef di-encode dengan encodeURIComponent. */
  "/game/$gameRef": { params: { gameRef: string }; loader: "game" };
  "/me": { loader: "positions+balance" };
  "/leaderboard": { loader: "leaderboard" };
}

// ----------------------------------------------------------------- hook (queries/, mutations/)
// Bentuk data yang dikembalikan. Pembungkus TanStack (useQuery/useMutation) ditambahkan saat implementasi.

export interface QueryData {
  useGames: GameSummary[];               // resolver GET /games, staleTime 5 s + SSE
  useGame: Game;                         // resolver GET /games/:gameRef, staleTime 0 + SSE
  usePositions: Position[];              // Envio, cadangan resolver, staleTime 10 s
  useBalance: bigint;                    // MockUSDC.balanceOf, staleTime 5 s
  useAllowance: bigint;                  // MockUSDC.allowance, staleTime 30 s
  useLeaderboard: { address: string; netProfit: bigint; betCount: number; winCount: number }[];
  useChainTime: number;                  // offset detik chain - lokal
}

export interface MutationVars {
  useCreateAccount: void;                // Mera create + POST /faucet + approveMax
  useUnlockAccount: void;
  /** Optimistic: pool di qk.game(gameRef); rollback + toast saat gagal. Invalidate game, positions, balance. */
  useBet: { gameRef: string; marketId: bigint; yes: boolean; amount: bigint };
  useClaim: { marketId: bigint };
  useClaimMany: { marketIds: bigint[] };
  useRefund: { marketId: bigint };
}
export type MutationResult = TransactionReceipt;

// ----------------------------------------------------------------- props komponen

export interface LiveBoardProps {
  fen: string;
  lastMove?: { from: string; to: string };
  ply: number;
  isReplay: boolean;
}

export interface MarketCardProps {
  market: Market;
  phase: MarketPhase;
  /** Posisi pengguna aktif di pasar ini, kalau ada. */
  position?: Position;
  feeBps: number;
}

export interface BetPanelProps {
  market: Market;
  /** Sisa cap = maxStakePerUser - stake pengguna di pasar ini. */
  remainingCap: bigint;
  account: "none" | "locked" | "unlocked";
  pending: boolean;
  onStake(yes: boolean, amount: bigint): void;
}

export interface CountdownProps {
  lockTime: number;
  /** Dari ChainClock, bukan Date.now(). */
  nowSec: number;
}

export interface PositionRowProps {
  position: Position;
  phase: MarketPhase;
  onClaim(): void;
  onRefund(): void;
}

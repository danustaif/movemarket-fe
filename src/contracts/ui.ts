// Kontrak UI: route, hook query/mutation, dan props komponen utama. Spesifikasi: source/docs/FRONTEND.md
// bagian 2, 4, 5, 8; desain visual: source/DESIGN.md dan source/design/prototype/. Teks dari COPY.
import type { GameSummary } from "@movemarket/shared";
import type { Address, Hex, TransactionReceipt } from "viem";
import type { AccountState } from "./account.ts";
import type { Game, Leader, Market, MarketPhase, Position } from "./data.ts";

// ----------------------------------------------------------------- route (TanStack Router)

export interface Routes {
  /** Landing: partai unggulan + pasar terbuka semua meja (detail tiap partai yang belum selesai). */
  "/": { loader: "games" };
  "/games": { loader: "games" };
  "/onboarding": { loader: null };
  /** gameRef di-encode dengan encodeURIComponent. */
  "/game/$gameRef": { params: { gameRef: string }; loader: "game" };
  "/me": { loader: "positions+balance" };
  "/leaderboard": { loader: "leaderboard" };
  /** Pemulihan dengan passkey backup (D27): alamat diketik, atau dari link /restore/$address yang disalin di /me. */
  "/restore": { loader: never };
  "/restore/$address": { loader: never };
}

// ----------------------------------------------------------------- hook (queries/, mutations/)
// Bentuk data yang dikembalikan. Pembungkus TanStack (useQuery/useMutation) ditambahkan saat implementasi.

export interface QueryData {
  useGames: GameSummary[];               // resolver GET /games, staleTime 5 s + SSE
  useGame: Game;                         // resolver GET /games/:gameRef, staleTime 0 + SSE
  usePositions: Position[];              // Envio, cadangan resolver, staleTime 10 s
  useBalance: bigint;                    // MockUSDC.balanceOf, staleTime 5 s
  useAllowance: bigint;                  // MockUSDC.allowance, staleTime 30 s
  useLeaderboard: Leader[];
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
  /** Passkey backup (D27): Mera vault + POST /vault bertanda tangan. Invalidate qk.backups. */
  useAddBackup: void;
  useRemoveBackup: { id: Hex };
  /** restoreFromVault lalu status unlocked. */
  useRestoreBackup: { address: Address; vault: string };
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
  account: AccountState["status"];
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

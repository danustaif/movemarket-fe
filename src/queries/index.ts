// Query hook dan queryOptions (untuk loader ensureQueryData). staleTime: FRONTEND.md bagian 4.
import { liveMarketAbi, mockUsdcAbi, SOT } from "@movemarket/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import { qk } from "../contracts/data.ts";
import type { QueryData } from "../contracts/ui.ts";
import { contracts, LIVE_MARKET, MOCK_USDC, publicClient } from "../lib/chain.ts";
import { indexer, positionFromIndexed } from "../lib/envio.ts";
import { resolver } from "../lib/resolver.ts";
import { chainClock, fetchChainOffset } from "../lib/time.ts";

export { qk };

export const gamesQuery = () =>
  queryOptions({ queryKey: qk.games(), queryFn: (): Promise<QueryData["useGames"]> => resolver.games(), staleTime: 5_000 });

export const gameQuery = (gameRef: string) =>
  queryOptions({ queryKey: qk.game(gameRef), queryFn: (): Promise<QueryData["useGame"]> => resolver.game(gameRef), staleTime: 0 });

export const positionsQuery = (address: Address) =>
  queryOptions({
    queryKey: qk.positions(address),
    queryFn: async (): Promise<QueryData["usePositions"]> => {
      try {
        return (await indexer.positions(address)).map(positionFromIndexed);
      } catch {
        // Indexer kosong atau bermasalah: cadangan GET /positions/:address.
        return resolver.positions(address);
      }
    },
    staleTime: 10_000,
  });

export const balanceQuery = (address: Address) =>
  queryOptions({
    queryKey: qk.balance(address),
    queryFn: (): Promise<QueryData["useBalance"]> =>
      publicClient.readContract({ address: contracts().mockUsdc, abi: mockUsdcAbi, functionName: "balanceOf", args: [address] }),
    staleTime: 5_000,
  });

export const allowanceQuery = (address: Address) =>
  queryOptions({
    queryKey: qk.allowance(address),
    queryFn: (): Promise<QueryData["useAllowance"]> => {
      const { mockUsdc, liveMarket } = contracts();
      return publicClient.readContract({ address: mockUsdc, abi: mockUsdcAbi, functionName: "allowance", args: [address, liveMarket] });
    },
    staleTime: 30_000,
  });

export const leaderboardQuery = () =>
  queryOptions({
    queryKey: qk.leaderboard(),
    queryFn: (): Promise<QueryData["useLeaderboard"]> => indexer.leaderboard(),
    staleTime: 30_000,
  });

const refreshMs = SOT.frontend.chainTimeRefreshSec * 1000;

export const chainTimeQuery = () =>
  queryOptions({
    queryKey: qk.chainTime(),
    queryFn: async (): Promise<QueryData["useChainTime"]> => {
      const offset = await fetchChainOffset(publicClient);
      chainClock.setOffset(offset);
      return offset;
    },
    staleTime: refreshMs,
    refetchInterval: refreshMs,
  });

export type Payouts = Record<string, { claimable: bigint; refundable: bigint }>;

/** claimable/refundable dibaca di tag finalized (SOT D20): dasar mengaktifkan tombol Claim dan Refund. */
export const payoutsQuery = (address: Address, marketIds: readonly bigint[]) =>
  queryOptions({
    queryKey: ["payouts", address.toLowerCase(), marketIds.map(String)] as const,
    queryFn: async (): Promise<Payouts> => {
      const { liveMarket } = contracts();
      const read = (functionName: "claimable" | "refundable", id: bigint) =>
        ({ address: liveMarket, abi: liveMarketAbi, functionName, args: [id, address] }) as const;
      const res = await publicClient.multicall({
        contracts: marketIds.flatMap((id) => [read("claimable", id), read("refundable", id)]),
        allowFailure: false,
        blockTag: SOT.frontend.readTags.claimGating as "finalized",
      });
      return Object.fromEntries(marketIds.map((id, i) => [String(id), { claimable: res[2 * i]!, refundable: res[2 * i + 1]! }]));
    },
    staleTime: 5_000,
  });

export const useGames = () => useQuery(gamesQuery());
export const useGame = (gameRef: string) => useQuery(gameQuery(gameRef));
export const useLeaderboard = () => useQuery(leaderboardQuery());
export const useChainTime = () => useQuery(chainTimeQuery());

/**
 * Hook tanpa akun: builder query tidak boleh menerima undefined (qk.* memanggil toLowerCase saat membangun key).
 * Alamat nol hanya mengisi key; query tetap mati lewat `enabled: !!address`, jadi tidak pernah di-fetch.
 */
const keyAddress = (address: Address | undefined): Address => address ?? zeroAddress;

export const usePositions = (address: Address | undefined) =>
  useQuery({ ...positionsQuery(keyAddress(address)), enabled: !!address });

export const useBalance = (address: Address | undefined) =>
  useQuery({ ...balanceQuery(keyAddress(address)), enabled: !!address && !!MOCK_USDC });

export const useAllowance = (address: Address | undefined) =>
  useQuery({ ...allowanceQuery(keyAddress(address)), enabled: !!address && !!MOCK_USDC && !!LIVE_MARKET });

/**
 * Gating tombol Claim/Refund: aktif hanya kalau angka di blok finalized > 0.
 * Contoh: const { canClaim } = usePayouts(address, positions.map((p) => p.marketId)).
 */
export function usePayouts(address: Address | undefined, marketIds: readonly bigint[]) {
  const q = useQuery({ ...payoutsQuery(keyAddress(address), marketIds), enabled: !!address && marketIds.length > 0 && !!LIVE_MARKET });
  return {
    ...q,
    canClaim: (id: bigint) => (q.data?.[String(id)]?.claimable ?? 0n) > 0n,
    canRefund: (id: bigint) => (q.data?.[String(id)]?.refundable ?? 0n) > 0n,
  };
}

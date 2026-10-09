// Klien GraphQL Envio. Query disalin dari backend/indexer/queries.graphql (INDEXER.md bagian 4).
import { ENUMS, SOT, type IndexedPosition, type LeaderboardRow, type StatusCode } from "@movemarket/shared";
import type { IndexerClient, Position } from "../contracts/data.ts";

const MY_POSITIONS = `query MyPositions($user: String!) {
  Position(where: { user_id: { _eq: $user } }, order_by: { createdAt: desc }, limit: 100) {
    id stakeYes stakeNo payout settled
    market { id gameRef marketType side fromPly toPly lockTime resolveDeadline status outcome voidReason poolYes poolNo resolvedTx }
  }
}`;

const LEADERBOARD = `query Leaderboard {
  User(order_by: { netProfit: desc }, limit: 20) {
    id netProfit betCount winCount
  }
}`;

export function createIndexerClient(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): IndexerClient {
  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!url) throw new Error("VITE_ENVIO_URL is empty");
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`indexer HTTP ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? "indexer returned no data");
    return body.data;
  }
  return {
    positions: async (address) =>
      (await gql<{ Position: IndexedPosition[] }>(MY_POSITIONS, { user: address.toLowerCase() })).Position,
    leaderboard: async () => (await gql<{ User: LeaderboardRow[] }>(LEADERBOARD)).User,
  };
}

/** Indexer ke model Position. claimable = perkiraan rumus kontrak `_payout`. */
export function positionFromIndexed(p: IndexedPosition): Position {
  const m = p.market;
  const stakeYes = BigInt(p.stakeYes);
  const stakeNo = BigInt(p.stakeNo);
  const poolYes = BigInt(m.poolYes);
  const poolNo = BigInt(m.poolNo);
  let claimable = 0n;
  if (m.status === "RESOLVED" && !p.settled && (m.outcome === 1 || m.outcome === 2)) {
    const [win, winPool] = m.outcome === 1 ? [stakeYes, poolYes] : [stakeNo, poolNo];
    // ponytail: fee dari SOT default karena indexer tidak menyimpan fee pasar; angka pasti dari usePayouts (claimable on-chain).
    const total = poolYes + poolNo;
    const fee = poolYes > 0n && poolNo > 0n ? (total * BigInt(SOT.contract.defaults.feeBps)) / 10_000n : 0n;
    if (winPool > 0n) claimable = (win * (total - fee)) / winPool;
  }
  return {
    marketId: BigInt(m.id),
    gameRef: m.gameRef,
    stakeYes,
    stakeNo,
    status: ENUMS.Status.indexOf(m.status) as StatusCode,
    outcome: m.outcome,
    resolveDeadline: Number(m.resolveDeadline),
    settled: p.settled,
    claimable,
    voidReason: m.voidReason,
  };
}

export const indexer = createIndexerClient(import.meta.env.VITE_ENVIO_URL ?? "");

// Klien REST resolver (RESOLVER_SERVICE.md bagian 3). DecimalString diubah ke bigint hanya di sini.
import type { ApiError, Copy, MarketDto, PositionDto, ResolverRoutes } from "@movemarket/shared";
import type { Address } from "viem";
import type { Market, Position, ResolverClient } from "../contracts/data.ts";

export class ResolverError extends Error {
  readonly status: number;
  readonly code?: keyof Copy["errors"];
  constructor(status: number, message: string, code?: keyof Copy["errors"]) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const toMarket = (d: MarketDto, gameRef: string): Market => ({
  ...d,
  id: BigInt(d.id),
  gameRef,
  poolYes: BigInt(d.poolYes),
  poolNo: BigInt(d.poolNo),
});

export const toPosition = (d: PositionDto): Position => ({
  ...d,
  marketId: BigInt(d.marketId),
  stakeYes: BigInt(d.stakeYes),
  stakeNo: BigInt(d.stakeNo),
  claimable: BigInt(d.claimable),
});

/** Bentuk fetch yang dipakai klien (tanpa tambahan tipe runtime seperti `preconnect` di Bun). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type Res<R extends keyof ResolverRoutes> = ResolverRoutes[R]["res"];

export function createResolverClient(baseUrl: string, fetchImpl: FetchLike = (...a) => fetch(...a)): ResolverClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function call<R extends keyof ResolverRoutes>(path: string, body?: ResolverRoutes[R]["body"]): Promise<Res<R>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, body === undefined ? undefined : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new ResolverError(0, e instanceof Error ? e.message : String(e), "RESOLVER_OFFLINE");
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new ResolverError(res.status, err?.error ?? res.statusText, err?.code);
    }
    return res.json() as Promise<Res<R>>;
  }

  return {
    games: async () => (await call<"GET /games">("/games")).games,
    game: async (gameRef) => {
      const r = await call<"GET /games/:gameRef">(`/games/${encodeURIComponent(gameRef)}`);
      return { game: r.game, markets: r.markets.map((m) => toMarket(m, gameRef)) };
    },
    positions: async (address: Address) =>
      (await call<"GET /positions/:address">(`/positions/${address}`)).positions.map(toPosition),
    faucet: (address) => call<"POST /faucet">("/faucet", { address }),
    faucetGas: (address) => call<"POST /faucet/gas">("/faucet/gas", { address }),
  };
}

export const resolver = createResolverClient(import.meta.env.VITE_RESOLVER_URL ?? "");

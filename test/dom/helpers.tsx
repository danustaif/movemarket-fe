// Helper test DOM: fixture domain, render dalam router memory, dan render aplikasi lengkap dengan QueryClient baru.
import { expect, spyOn } from "bun:test";
import { useToasts } from "../../src/components/common/toast.ts";
import { publicClient } from "../../src/lib/chain.ts";
import { indexer } from "../../src/lib/envio.ts";
import { resolver } from "../../src/lib/resolver.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { useSseStore } from "../../src/stores/sse.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Game, Market, Position } from "../../src/contracts/data.ts";
import { createAppRouter } from "../../src/router.tsx";

/**
 * Elemen tidak ada. Jangan pakai expect(el).toBeNull(): saat gagal, formatter Bun mencetak node happy-dom
 * beserta seluruh pohon window-nya dan test menggantung, bukan gagal.
 */
export function absent(el: Element | null) {
  expect(el?.outerHTML ?? null).toBeNull();
}

export const GAME_REF = "lichess:game:abcdefgh";
export const ADDRESS = "0x00000000000000000000000000000000000000a1" as const;
export const nowSec = () => Math.floor(Date.now() / 1000);

export const market = (o: Partial<Market> = {}): Market => ({
  id: 7n, gameRef: GAME_REF, marketType: 0, side: 0, fromPly: 33, toPly: 36,
  lockTime: nowSec() + 120, resolveDeadline: nowSec() + 3600, question: "Any check in plies 33 to 36?",
  poolYes: 0n, poolNo: 0n, provisional: null, final: null, voidReason: null, ...o,
});

export const position = (o: Partial<Position> = {}): Position => ({
  marketId: 7n, gameRef: GAME_REF, stakeYes: 0n, stakeNo: 0n, status: 0, outcome: 0,
  resolveDeadline: nowSec() + 3600, settled: false, claimable: 0n, voidReason: null, ...o,
});

export const game = (markets: Market[], o: Partial<Game["game"]> = {}): Game => ({
  game: {
    gameRef: GAME_REF, source: "replay", isReplay: true, speed: "classical", white: { name: "Alice" }, black: { name: "Bob" },
    ply: 20, fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", ended: false, openMarkets: 1, sans: ["e4"], ...o,
  },
  markets,
});

/** Komponen yang memakai <Link> butuh router; rute /onboarding ada supaya link bisa diikuti. */
export function renderInRouter(ui: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: () => ui });
  const onboarding = createRoute({ getParentRoute: () => root, path: "/onboarding", component: () => null });
  const router = createRouter({ routeTree: root.addChildren([index, onboarding]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return { router, ...render(<RouterProvider router={router as never} />) };
}

/** Aplikasi lengkap (layout root + semua route) di `path`, QueryClient baru tanpa retry. */
export function renderApp(path: string, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createAppRouter(queryClient);
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  return {
    router,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

// ----------------------------------------------------------------- batas modul (tanpa jaringan)


/**
 * Ganti klien resolver, Envio, dan RPC baca dengan spy berdefault aman. Pulihkan dengan mock.restore() (afterEach).
 * Store global dikembalikan ke awal: tanpa akun, SSE tertutup, tanpa toast.
 */
export function stubBoundaries() {
  useAccountStore.setState({ status: "none", address: undefined, account: undefined, mismatch: false });
  useSseStore.setState({ status: "closed", replayStarting: null });
  useToasts.setState({ items: [] });
  return {
    games: spyOn(resolver, "games").mockResolvedValue([]),
    game: spyOn(resolver, "game").mockRejectedValue(new Error("resolver.game not stubbed")),
    positions: spyOn(resolver, "positions").mockResolvedValue([]),
    indexerPositions: spyOn(indexer, "positions").mockRejectedValue(new Error("indexer.positions not stubbed")),
    leaderboard: spyOn(indexer, "leaderboard").mockResolvedValue([]),
    readContract: spyOn(publicClient, "readContract").mockRejectedValue(new Error("readContract not stubbed")),
    multicall: spyOn(publicClient, "multicall").mockRejectedValue(new Error("multicall not stubbed")),
    getBlock: spyOn(publicClient, "getBlock").mockImplementation((async () => ({ timestamp: BigInt(nowSec()) })) as never),
  };
}

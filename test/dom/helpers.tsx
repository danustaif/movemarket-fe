// Helper test DOM: fixture domain, render dalam router memory, dan render aplikasi lengkap dengan QueryClient baru.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Game, Market, Position } from "../../src/contracts/data.ts";
import { createAppRouter } from "../../src/router.tsx";

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

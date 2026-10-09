// Route peringkat: loader prefetch, komponen di -leaderboard.page.tsx (lazy).
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { leaderboardQuery } from "../queries/index.ts";
import { rootRoute } from "./__root.tsx";

export const leaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leaderboard",
  // Prefetch; kegagalan indexer ditampilkan oleh hook (ErrorBox), bukan errorComponent route.
  loader: ({ context }) => context.queryClient.ensureQueryData(leaderboardQuery()).then(() => undefined, () => undefined),
  component: lazyRouteComponent(() => import("./-leaderboard.page.tsx"), "Leaderboard"),
});

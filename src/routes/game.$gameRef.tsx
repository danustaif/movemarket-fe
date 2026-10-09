// Route partai: loader prefetch, komponen di -game.page.tsx (lazy).
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { gameQuery } from "../queries/index.ts";
import { rootRoute } from "./__root.tsx";

export const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameRef",
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(gameQuery(params.gameRef))
      .catch(() => undefined),
  component: lazyRouteComponent(() => import("./-game.page.tsx"), "GamePage"),
});

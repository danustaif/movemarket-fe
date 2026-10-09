// TanStack Router berbasis kode. Konteks membawa queryClient untuk loader ensureQueryData.
import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { Skeleton } from "./components/common/States.tsx";
import { rootRoute } from "./routes/__root.tsx";
import { gameRoute } from "./routes/game.$gameRef.tsx";
import { indexRoute } from "./routes/index.tsx";
import { leaderboardRoute } from "./routes/leaderboard.tsx";
import { meRoute } from "./routes/me.tsx";
import { onboardingRoute } from "./routes/onboarding.tsx";

const routeTree = rootRoute.addChildren([indexRoute, onboardingRoute, gameRoute, meRoute, leaderboardRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultPendingMs: 200,
    defaultPendingComponent: () => <div className="flex flex-col gap-3"><Skeleton className="h-12 w-48" /><Skeleton className="h-[220px]" /></div>,
  });
}

declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof createAppRouter> }
}

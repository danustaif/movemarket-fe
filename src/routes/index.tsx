// Landing: hero partai unggulan dengan papan 3D, pasar yang paling cepat terkunci, Next to lock, How results work.
// Komponen di -landing.page.tsx (lazy); loader hanya prefetch daftar partai.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { gamesQuery } from "../queries/index.ts";
import { rootRoute } from "./__root.tsx";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Resolver mati tidak boleh memblokir halaman; komponen menampilkan state error.
  loader: ({ context }) => context.queryClient.ensureQueryData(gamesQuery()).catch(() => undefined),
  component: lazyRouteComponent(() => import("./-landing.page.tsx"), "LandingPage"),
});

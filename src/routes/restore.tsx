// Route pemulihan dengan passkey backup (SOT D27): /restore (alamat diketik) dan /restore/$address (link dari /me).
// Komponen di -restore.page.tsx (lazy); kriptografi Mera dimuat lazy lewat lib/account/prf.ts saat dipakai.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./__root.tsx";

const component = lazyRouteComponent(() => import("./-restore.page.tsx"), "Restore");

export const restoreRoute = createRoute({ getParentRoute: () => rootRoute, path: "/restore", component });
export const restoreAddressRoute = createRoute({ getParentRoute: () => rootRoute, path: "/restore/$address", component });

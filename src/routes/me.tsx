// Route profil: loader prefetch, komponen di -me.page.tsx (lazy).
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { MOCK_USDC } from "../lib/chain.ts";
import { balanceQuery, positionsQuery } from "../queries/index.ts";
import { useAccountStore } from "../stores/account.ts";
import { rootRoute } from "./__root.tsx";

export const meRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/me",
  // Alamat dari marker sudah diketahui walau terkunci; prefetch saja, kegagalan ditampilkan oleh hook.
  loader: ({ context }) => {
    const address = useAccountStore.getState().address;
    if (!address) return;
    return Promise.allSettled([
      context.queryClient.ensureQueryData(positionsQuery(address)),
      MOCK_USDC && context.queryClient.ensureQueryData(balanceQuery(address)),
    ]).then(() => undefined);
  },
  component: lazyRouteComponent(() => import("./-me.page.tsx"), "Me"),
});

// Route onboarding, komponen di -onboarding.page.tsx (lazy).
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./__root.tsx";

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: lazyRouteComponent(() => import("./-onboarding.page.tsx"), "Onboarding"),
});

// Layout: header (merek, nav, badge Monad Testnet, akun + saldo), banner status, konten, footer, tab bar mobile, toaster.
import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { COPY, UI } from "../components/common/copy.ts";
import { SYMBOL, shortAddr, usdcOrDash } from "../components/common/format.ts";
import { LockIcon, Spinner } from "../components/common/Spinner.tsx";
import { Banner, Empty, ErrorBox } from "../components/common/States.tsx";
import { Toaster } from "../components/common/Toaster.tsx";
import { useAppStatus, useAccountView } from "./-wiring.ts";

export interface RouterContext { queryClient: QueryClient }

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  errorComponent: ({ reset }) => (
    <main className="mx-auto max-w-[560px] p-4 pt-10">
      <ErrorBox action={<button type="button" className="btn gold sm" onClick={reset}>{COPY.actions.retry}</button>}>{UI.generic.error}</ErrorBox>
    </main>
  ),
  notFoundComponent: () => <Empty action={<Link to="/" className="btn gold sm">{UI.game.back}</Link>}>{UI.generic.notFound}</Empty>,
});

function AccountArea() {
  const acct = useAccountView();
  if (acct.status === "none") {
    return (
      <Link to="/onboarding" className="btn gold sm">
        <span className="sm:hidden">{COPY.actions.start}</span>
        <span className="hidden sm:inline">{COPY.actions.createAccount}</span>
      </Link>
    );
  }
  if (acct.status === "locked") {
    return (
      <button type="button" className={`btn gold sm ${acct.unlocking ? "busy" : ""}`} onClick={acct.unlock} disabled={acct.unlocking} aria-label={COPY.actions.unlock}>
        {acct.unlocking ? <Spinner size={16} /> : <LockIcon />}
        <span className="hidden sm:inline">{COPY.actions.unlock}</span>
      </button>
    );
  }
  return (
    <Link to="/me" className="flex min-h-11 items-center gap-2.5 rounded-control bg-panel py-0 pr-1.5 pl-3 text-[15px] font-extrabold text-white no-underline">
      <span className="whitespace-nowrap">{usdcOrDash(acct.balance)} <span className="hidden font-semibold text-muted sm:inline">{SYMBOL}</span></span>
      {acct.address && <span className="hidden rounded-[3px] bg-gold px-2 py-1 text-[13px] text-ink sm:inline">{shortAddr(acct.address)}</span>}
    </Link>
  );
}

const NAV = [
  { to: "/", label: UI.nav.games },
  { to: "/me", label: UI.nav.positions },
  { to: "/leaderboard", label: UI.nav.leaderboard },
] as const;

function Layout() {
  const { sse, resolverOffline, sessionEnded, unlock } = useAppStatus();
  return (
    <div className="flex min-h-screen flex-col pb-[58px] sm:pb-0">
      <header className="sticky top-0 z-20 bg-control">
        <div className="mx-auto flex min-h-[60px] max-w-[1380px] items-center gap-x-2.5 px-3 sm:gap-x-6 sm:px-7">
          <Link to="/" className="display font-extrabold text-[20px] tracking-[0.02em] sm:text-[22px] text-white no-underline">
            {COPY.brand.name}
          </Link>
          <nav aria-label={UI.nav.label} className="hidden gap-1.5 sm:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="nav" activeOptions={{ exact: n.to === "/" }} activeProps={{ "aria-current": "page" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex-auto" />
          <span className="rounded-tag bg-muted px-2 py-[3px] text-[13px] font-bold whitespace-nowrap text-ink">{COPY.brand.testnetBadge}</span>
          <AccountArea />
        </div>
      </header>

      {resolverOffline && <Banner kind="amber">{COPY.errors.RESOLVER_OFFLINE}</Banner>}
      {!resolverOffline && sse === "reconnecting" && <Banner kind="panel" busy>{COPY.errors.SSE_RECONNECTING}</Banner>}
      {sessionEnded && (
        <Banner kind="white" action={<button type="button" className="btn dark sm" onClick={unlock}>{COPY.actions.unlock}</button>}>
          {COPY.errors.SESSION_ENDED}
        </Banner>
      )}

      <main className="mx-auto box-border w-full max-w-[1380px] flex-auto px-3 pt-4 pb-8 sm:px-7 sm:pt-6">
        <Outlet />
      </main>

      <footer className="mx-auto box-border w-full max-w-[1380px] px-4 pt-3.5 pb-6 text-[13px] text-muted sm:px-7">{UI.footer}</footer>

      <nav aria-label={UI.nav.label} className="fixed inset-x-0 bottom-0 z-20 flex bg-control shadow-[0_-1px_0_var(--color-divider)] sm:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="tab" activeOptions={{ exact: n.to === "/" }} activeProps={{ "aria-current": "page" }}>
            {n.label}
          </Link>
        ))}
      </nav>

      <Toaster />
    </div>
  );
}

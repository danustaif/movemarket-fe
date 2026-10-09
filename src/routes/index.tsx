// Beranda: partai live di atas, replay di bawah (USER_FLOW.md bagian 1 dan 6).
import { createRoute } from "@tanstack/react-router";
import { COPY, UI } from "../components/common/copy.ts";
import { ErrorBox, Empty, Skeleton } from "../components/common/States.tsx";
import { Spinner } from "../components/common/Spinner.tsx";
import { GameListItem } from "../components/game/GameListItem.tsx";
import { gamesQuery } from "../queries/index.ts";
import { rootRoute } from "./__root.tsx";
import { useGames, useReplayStarting } from "./-wiring.ts";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Prefetch saja: resolver mati tidak boleh memblokir halaman; hook menampilkan state error.
  loader: ({ context }) => context.queryClient.ensureQueryData(gamesQuery()).catch(() => undefined),
  component: Home,
});

function Home() {
  const games = useGames();
  const replayStarting = useReplayStarting();
  const list = [...(games.data ?? [])].sort((a, b) => Number(a.isReplay) - Number(b.isReplay) || Number(a.ended) - Number(b.ended));

  return (
    <section aria-labelledby="home-h" className="flex flex-col gap-5">
      <h1 id="home-h" className="display m-0 text-[40px] sm:text-[56px]">{UI.home.title}</h1>

      {replayStarting && (
        <div role="status" className="flex items-center gap-3 rounded-panel bg-panel p-4 text-lg font-extrabold">
          <Spinner size={22} accent="text-gold" />
          {COPY.home.replayStarting}
        </div>
      )}

      {games.isPending ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-[220px]" /><Skeleton className="h-[220px]" /></div>
      ) : games.isError && list.length === 0 ? (
        <ErrorBox action={<button type="button" className="btn gold sm" onClick={() => games.refetch()}>{COPY.actions.retry}</button>}>
          {COPY.errors.RESOLVER_OFFLINE}
        </ErrorBox>
      ) : list.length === 0 ? (
        <Empty>{COPY.home.noGames}</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((g) => <GameListItem key={g.gameRef} game={g} />)}
        </div>
      )}
    </section>
  );
}

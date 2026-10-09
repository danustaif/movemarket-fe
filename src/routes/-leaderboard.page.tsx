// Komponen route leaderboardRoute (dimuat lazy lewat lazyRouteComponent).
import { COPY, UI } from "../components/common/copy.ts";
import { shortAddr, usdc } from "../components/common/format.ts";
import { Empty, ErrorBox, Skeleton } from "../components/common/States.tsx";
import { useLeaderboard } from "./-wiring.ts";


export function Leaderboard() {
  const q = useLeaderboard();
  const rows = q.data ?? [];
  return (
    <section aria-labelledby="lb-h" className="flex flex-col gap-5">
      <h1 id="lb-h" className="display m-0 text-[40px] sm:text-[56px]">{UI.leaderboard.title}</h1>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.isError ? (
        <ErrorBox action={<button type="button" className="btn gold sm" onClick={() => q.refetch()}>{COPY.actions.retry}</button>}>{COPY.errors.INDEXER_OFFLINE}</ErrorBox>
      ) : rows.length === 0 ? (
        <Empty>{UI.leaderboard.empty}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-panel bg-panel">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead className="text-sm text-muted">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">{UI.leaderboard.rank}</th>
                <th className="px-3.5 py-2.5 font-semibold">{UI.leaderboard.player}</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">{UI.leaderboard.profit}</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">{UI.leaderboard.predictions}</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">{UI.leaderboard.wins}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.address} className="border-t border-divider">
                  <td className="px-3.5 py-2.5 font-extrabold">{i + 1}</td>
                  <td className="px-3.5 py-2.5 font-bold">{shortAddr(r.address)}</td>
                  <td className={`px-3.5 py-2.5 text-right font-extrabold ${r.netProfit < 0n ? "text-coral" : "text-gold"}`}>
                    {r.netProfit > 0n ? "+" : r.netProfit < 0n ? "-" : ""}{usdc(r.netProfit < 0n ? -r.netProfit : r.netProfit)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">{r.betCount}</td>
                  <td className="px-3.5 py-2.5 text-right">{r.winCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

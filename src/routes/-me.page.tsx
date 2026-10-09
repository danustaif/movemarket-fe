// Komponen route meRoute (dimuat lazy lewat lazyRouteComponent).
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { COPY, UI, fill } from "../components/common/copy.ts";
import { SYMBOL, usdc, usdcOrDash } from "../components/common/format.ts";
import { Modal } from "../components/common/Modal.tsx";
import { LockIcon, Spinner } from "../components/common/Spinner.tsx";
import { Empty, ErrorBox, Skeleton } from "../components/common/States.tsx";
import { useNowSec } from "../components/common/useNowSec.ts";
import { PositionRow } from "../components/me/PositionRow.tsx";
import { qk, type Game } from "../contracts/data.ts";
import { canSend } from "../lib/account/session.ts";
import { positionPhase } from "../lib/marketPhase.ts";
import { useAccountView, useChainOffset, useClaim, useClaimMany, useGetTokens, usePayouts, usePositionsQuery, useRefund } from "./-wiring.ts";

export function Me() {
  const acct = useAccountView();
  return (
    <section aria-labelledby="me-h" className="flex flex-col gap-5">
      <h1 id="me-h" className="display m-0 text-[40px] sm:text-[56px]">{UI.me.title}</h1>
      {acct.status === "none" ? (
        <Empty action={<Link to="/onboarding" className="btn gold">{COPY.actions.createAccount}</Link>}>{UI.me.noAccount}</Empty>
      ) : acct.status === "locked" ? (
        <Empty action={
          <button type="button" className={`btn gold ${acct.unlocking ? "busy" : ""}`} onClick={acct.unlock} disabled={acct.unlocking}>
            {acct.unlocking ? <Spinner /> : <LockIcon />}{COPY.actions.unlock}
          </button>
        }>{COPY.errors.SESSION_ENDED}</Empty>
      ) : (
        <Positions />
      )}
    </section>
  );
}

function Positions() {
  const acct = useAccountView();
  const q = usePositionsQuery(acct.address);
  const now = useNowSec(useChainOffset());
  const qc = useQueryClient();
  const claim = useClaim();
  const refund = useRefund();
  const claimMany = useClaimMany();
  const getTokens = useGetTokens();
  /** Gas claimMany belum diukur di SOT: Claim all nonaktif, klaim per pasar tetap bisa. */
  const claimAllReady = canSend("claimMany");
  const [confirmAll, setConfirmAll] = useState(false);

  const rows = (q.data ?? []).map((p) => ({ p, phase: positionPhase(p, now) }));
  // Claim/Refund hanya aktif dari angka di blok finalized (SOT D20), lewat usePayouts F1.
  const payouts = usePayouts(acct.address, rows.filter(({ p }) => !p.settled).map(({ p }) => p.marketId));
  const claimable = rows.filter(({ p }) => !p.settled && payouts.canClaim(p.marketId));
  const claimSum = claimable.reduce((s, { p }) => s + (payouts.data?.[String(p.marketId)]?.claimable ?? p.claimable), 0n);
  // Yang bisa diklaim di atas, lalu yang masih berjalan, lalu sisanya.
  const rank = ({ p, phase }: (typeof rows)[number]) => (claimable.some((c) => c.p === p) ? 0 : phase.phase === "locked" ? 1 : p.settled ? 3 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || Number(b.p.marketId - a.p.marketId));
  const question = (gameRef: string, id: bigint) => qc.getQueryData<Game>(qk.game(gameRef))?.markets.find((m) => m.id === id)?.question;
  const busyId = (m: { isPending: boolean; variables?: { marketId: bigint } }) => (m.isPending ? m.variables?.marketId : undefined);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-panel bg-panel p-4.5">
          <span className="text-sm font-semibold text-muted">{UI.me.balance}</span>
          <b className="display text-[40px]">
            {usdcOrDash(acct.balance)} <span className="text-xl text-muted normal-case">{SYMBOL}</span>
          </b>
          <button type="button" className="btn ghost sm mt-1.5 self-start" onClick={getTokens}>{COPY.actions.getTestTokens}</button>
        </div>
        <div className="flex flex-col gap-1.5 rounded-panel bg-gold p-4.5 text-ink">
          <span className="text-sm font-bold">{UI.me.readyToClaim}</span>
          <b className="display text-[40px]">{usdc(claimSum)} <span className="text-xl normal-case">{SYMBOL}</span></b>
          <button
            type="button" className={`btn dark sm mt-1.5 self-start ${claimMany.isPending ? "busy" : ""}`}
            disabled={claimable.length === 0 || claimMany.isPending || !claimAllReady}
            aria-describedby={claimAllReady ? undefined : "claim-all-note"}
            onClick={() => setConfirmAll(true)}
          >
            {claimMany.isPending && <Spinner size={16} />}{COPY.actions.claimAll}
          </button>
          {!claimAllReady && claimable.length > 0 && <span id="claim-all-note" className="text-sm font-semibold">{COPY.errors.GAS_NOT_MEASURED}</span>}
        </div>
      </div>

      {confirmAll && (
        <Modal labelledBy="ca-h" onClose={() => setConfirmAll(false)}>
          <div className="flex flex-col gap-3.5 p-4.5">
            <h2 id="ca-h" className="display m-0 text-[28px]">{fill(UI.me.claimAllTitle, { amount: usdc(claimSum) })}</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {claimable.map(({ p }) => (
                <li key={String(p.marketId)} className="flex justify-between gap-2.5 rounded-[3px] bg-wash px-2.5 py-2">
                  <span className="min-w-0">{question(p.gameRef, p.marketId) ?? `#${p.marketId}`}</span>
                  <b className="whitespace-nowrap">{usdc(payouts.data?.[String(p.marketId)]?.claimable ?? p.claimable)}</b>
                </li>
              ))}
            </ul>
            <span className="text-sm text-ink-muted">{fill(UI.me.claimAllNote, { n: claimable.length })}</span>
            <div className="flex gap-2.5">
              <button type="button" className="btn ghostd flex-1" onClick={() => setConfirmAll(false)}>{UI.stake.cancel}</button>
              <button
                type="button" className="btn gold flex-[2]"
                onClick={() => {
                  setConfirmAll(false);
                  claimMany.mutate({ marketIds: claimable.map(({ p }) => p.marketId) });
                }}
              >
                {COPY.actions.claimAll}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {q.isPending ? (
        <div className="flex flex-col gap-1.5"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : q.isError && rows.length === 0 ? (
        <ErrorBox action={<button type="button" className="btn gold sm" onClick={() => q.refetch()}>{COPY.actions.retry}</button>}>
          {COPY.errors.RESOLVER_OFFLINE}
        </ErrorBox>
      ) : rows.length === 0 ? (
        <Empty action={<Link to="/" className="btn gold">{UI.nav.games}</Link>}>{UI.me.noPositions}</Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map(({ p, phase }) => (
            <PositionRow
              key={String(p.marketId)} position={p} phase={phase} question={question(p.gameRef, p.marketId)}
              canClaim={payouts.canClaim(p.marketId)} canRefund={payouts.canRefund(p.marketId)}
              busy={busyId(claim) === p.marketId || busyId(refund) === p.marketId || claimMany.isPending}
              onClaim={() => claim.mutate({ marketId: p.marketId })}
              onRefund={() => refund.mutate({ marketId: p.marketId })}
            />
          ))}
        </div>
      )}
    </>
  );
}

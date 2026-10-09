// Dialog detail pasar (prototype Prototype.dc.html "detail dialog"): pertanyaan, rentang ply, pool dan odds,
// timeline dibuat, terkunci, hasil sementara, final + tx report CRE.
import type { Market, MarketPhase, Position } from "../../contracts/data.ts";
import { COPY, UI, fill } from "../common/copy.ts";
import { odds, usdc } from "../common/format.ts";
import { Modal } from "../common/Modal.tsx";
import { TxLink } from "../common/TxLink.tsx";
import { OutcomeBadge, phaseLabel } from "./OutcomeBadge.tsx";

const time = (unix: number) => new Date(unix * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function MarketDetail({ market, phase, position, feeBps, onClose }: {
  market: Market; phase: MarketPhase; position?: Position; feeBps: number; onClose(): void;
}) {
  const { poolYes, poolNo, provisional, final } = market;
  const locked = phase.phase !== "open";
  const steps = [
    { done: true, title: UI.detail.created },
    { done: locked, title: fill(locked ? UI.detail.locked : UI.detail.locks, { time: time(market.lockTime) }) },
    { done: !!provisional, title: provisional ? fill(COPY.market.status.provisional, { outcome: COPY.market.outcome[provisional] }) : UI.detail.provisional },
    {
      done: !!final,
      title: final ? phaseLabel(phase) : UI.detail.final,
      note: final ? (market.finalTx && <TxLink hash={market.finalTx} />) : provisional && COPY.errors.FINAL_PENDING,
    },
  ];
  return (
    <Modal labelledBy="md-h" onClose={onClose} dark>
      <div className="flex items-center gap-2.5 pt-3 pr-3 pl-4.5">
        <OutcomeBadge phase={phase} />
        <button type="button" className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-control border-0 bg-transparent text-white hover:bg-panel" onClick={onClose} aria-label={UI.stake.close}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="flex flex-col gap-4 px-4.5 pt-1.5 pb-4.5">
        <div className="flex flex-col gap-1">
          <h2 id="md-h" className="m-0 text-[21px] leading-tight font-extrabold">{market.question}</h2>
          <span className="text-sm text-muted">{fill(UI.detail.window, { fromPly: market.fromPly, toPly: market.toPly })}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {([[UI.detail.yesPool, poolYes, poolNo, "text-gold"], [UI.detail.noPool, poolNo, poolYes, "text-coral"]] as const).map(([label, side, other, color]) => (
            <div key={label} className="flex flex-col rounded-control bg-panel p-2.5">
              <span className="text-muted">{label}</span>
              <b className={`text-xl font-black ${color}`}>{usdc(side)}</b>
              <span className="text-soft">{fill(UI.market.pays, { odds: odds(side, other, feeBps) })}</span>
            </div>
          ))}
        </div>

        <ol aria-label={UI.detail.timeline} className="m-0 flex list-none flex-col gap-3 p-0">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-black text-ink ${s.done ? "bg-gold" : "bg-rule"}`}>{i + 1}</span>
              <div className="flex min-w-0 flex-col">
                <b className={s.done ? "text-white" : "text-muted"}>
                  {s.title}<span className="sr-only">, {s.done ? UI.detail.done : UI.detail.pending}</span>
                </b>
                {s.note && <span className="text-sm text-muted">{s.note}</span>}
              </div>
            </li>
          ))}
        </ol>

        {position && position.stakeYes + position.stakeNo > 0n && (
          <span className="text-[15px]">{fill(UI.me.stakeLine, { yes: usdc(position.stakeYes), no: usdc(position.stakeNo) })}</span>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>{UI.stake.close}</button>
      </div>
    </Modal>
  );
}

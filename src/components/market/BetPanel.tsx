// Panel stake di lembar putih (DESIGN.md "Stake sheet"). Validasi lokal: min, sisa cap, saldo.
// Kontrak tetap jadi penentu akhir; error revert ditangani mutation (rollback + toast).
import { SOT } from "@movemarket/shared";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { BetPanelProps } from "../../contracts/ui.ts";
import { COPY, UI, fill } from "../common/copy.ts";
import type { ErrorCode } from "../../lib/errors.ts";
import { parseUsdc, payout, SYMBOL, usdc, yesPct } from "../common/format.ts";
import { LockIcon, Spinner } from "../common/Spinner.tsx";

const MIN = BigInt(SOT.contract.defaults.minBet);
const MAX = BigInt(SOT.contract.defaults.maxStakePerUser);
const FEE_BPS = SOT.contract.defaults.feeBps;

/** Tambahan opsional di luar kontrak ui.ts (semua boleh tidak diisi). */
export interface BetPanelExtra {
  initialYes?: boolean;
  /** Saldo tUSDC; kalau ada, stake di atas saldo ditolak dengan INSUFFICIENT_USDC. */
  balance?: bigint;
  onUnlock?(): void;
  unlocking?: boolean;
  onGetTokens?(): void;
}

export function BetPanel({
  market, remainingCap, account, pending, onStake,
  initialYes = true, balance, onUnlock, unlocking, onGetTokens,
}: BetPanelProps & BetPanelExtra) {
  const [yes, setYes] = useState(initialYes);
  const [text, setText] = useState(String(SOT.frontend.betChipsUsdc[0]));
  const id = useId();
  const amount = parseUsdc(text);
  const pct = yesPct(market.poolYes, market.poolNo);
  const side = yes ? market.poolYes : market.poolNo;
  const other = yes ? market.poolNo : market.poolYes;

  const error: ErrorCode | null =
    text.trim() === "" ? null
    : amount === null || amount < MIN ? "AmountTooSmall"
    : amount > remainingCap ? "StakeCapExceeded"
    : balance !== undefined && amount > balance ? "INSUFFICIENT_USDC"
    : null;
  /** Nominal siap kirim, null kalau tidak valid. */
  const valid = error === null ? amount : null;
  const room = remainingCap > 0n ? remainingCap : 0n;

  return (
    <div className="flex flex-col gap-3.5">
      <div role="group" aria-label={COPY.actions.stake} className="flex gap-2">
        <button type="button" className="side yes" aria-pressed={yes} onClick={() => setYes(true)}>
          <span>{UI.market.yes}</span>
          {pct !== null && <small>{fill(UI.market.poolShare, { pct })}</small>}
        </button>
        <button type="button" className="side no" aria-pressed={!yes} onClick={() => setYes(false)}>
          <span>{UI.market.no}</span>
          {pct !== null && <small>{fill(UI.market.poolShare, { pct: 100 - pct })}</small>}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-amt`} className="flex justify-between text-[15px] font-extrabold">
          <span>{UI.stake.amountLabel}</span>
          {balance !== undefined && <span className="font-semibold text-ink-muted">{fill(UI.stake.balance, { amount: usdc(balance) })}</span>}
        </label>
        <div className="relative">
          <input
            id={`${id}-amt`} className="amt" inputMode="decimal" autoComplete="off" value={text}
            onChange={(e) => setText(e.target.value)} aria-invalid={error !== null} aria-describedby={`${id}-help`}
          />
          <span aria-hidden="true" className="absolute top-1/2 right-3.5 -translate-y-1/2 font-bold text-ink-muted">{SYMBOL}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOT.frontend.betChipsUsdc.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={amount === parseUsdc(String(c))} onClick={() => setText(String(c))}>
              {c}
            </button>
          ))}
        </div>
        <span id={`${id}-help`} className="text-[13px] text-ink-muted">
          {fill(UI.stake.help, { min: usdc(MIN), max: usdc(MAX), room: usdc(room) })}
        </span>
        {error && (
          <span role="alert" className="flex flex-wrap items-center gap-2 text-sm font-bold text-err-light">
            {COPY.errors[error]}
            {error === "INSUFFICIENT_USDC" && onGetTokens && (
              <button type="button" className="btn dark sm" onClick={onGetTokens}>{COPY.actions.getTestTokens}</button>
            )}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 rounded-control bg-wash px-3.5 py-3 text-[15px]">
        <div className="flex justify-between gap-2.5">
          <span>{UI.stake.ifRight}</span>
          <b className="text-lg">{usdc(valid !== null ? payout(valid, side, other, FEE_BPS) : 0n, 2)} {SYMBOL}</b>
        </div>
        <span className="text-[13px] text-ink-muted">{UI.stake.feeNote}</span>
      </div>

      {account === "none" ? (
        <Link to="/onboarding" className="btn gold lg">{COPY.actions.createAccount}</Link>
      ) : account === "locked" ? (
        <button type="button" className={`btn dark lg ${unlocking ? "busy" : ""}`} onClick={onUnlock} disabled={unlocking || !onUnlock}>
          {unlocking ? <Spinner /> : <LockIcon />}
          {COPY.actions.unlock}
        </button>
      ) : (
        <button
          type="button" className={`btn ${yes ? "yes" : "no"} lg ${pending ? "busy" : ""}`}
          disabled={valid === null || pending} onClick={() => valid !== null && onStake(yes, valid)}
        >
          {pending && <Spinner />}
          {pending ? UI.stake.sending : valid !== null ? `${COPY.actions.stake} ${usdc(valid)} ${SYMBOL}` : COPY.actions.stake}
        </button>
      )}
    </div>
  );
}

// Komponen route /restore dan /restore/$address (lazy). Pulihkan akun dengan passkey backup (SOT 12a, D27):
// alamat -> GET /vault/:address -> pilih vault -> decryptSecretVaultWithPasskey -> alamat sama -> unlocked + sesi D26.
import { Link, useParams } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { isAddress, type Address } from "viem";
import { COPY, UI, fill } from "../components/common/copy.ts";
import { backupKind, shortDate } from "../components/common/format.ts";
import { Spinner } from "../components/common/Spinner.tsx";
import { ErrorBox, Skeleton } from "../components/common/States.tsx";
import { errorMessage } from "../lib/errors.ts";
import { useBackups, useRestoreBackup } from "./-wiring.ts";

export function Restore() {
  const param = (useParams({ strict: false }) as { address?: string }).address ?? "";
  const [typed, setTyped] = useState(param);
  const [address, setAddress] = useState<Address | undefined>(isAddress(param) ? param : undefined);
  const [invalid, setInvalid] = useState(param !== "" && !isAddress(param));
  const q = useBackups(address);
  const restore = useRestoreBackup();

  const find = (e: FormEvent) => {
    e.preventDefault();
    const a = typed.trim();
    setInvalid(!isAddress(a));
    if (isAddress(a)) setAddress(a);
    restore.reset();
  };

  const err = invalid ? COPY.errors.ADDRESS_INVALID
    : restore.error ? (errorMessage(restore.error) ?? UI.generic.error)
    : q.isError ? COPY.errors.RESOLVER_OFFLINE
    : q.data?.length === 0 ? COPY.errors.BACKUP_NOT_FOUND
    : null;

  return (
    <section aria-labelledby="restore-h" className="mx-auto flex max-w-[560px] flex-col gap-4.5">
      <div className="flex flex-col gap-2">
        <h1 id="restore-h" className="display m-0 text-[40px] leading-[0.95] sm:text-[56px]">{UI.restore.title}</h1>
        <p className="m-0 text-[17px] text-soft">{UI.restore.lede}</p>
      </div>

      {restore.isSuccess ? (
        <>
          <p role="status" className="m-0 text-[17px] font-bold text-gold">{UI.restore.done}</p>
          <Link to="/me" className="btn gold lg">{UI.restore.go}</Link>
        </>
      ) : (
        <>
          <form onSubmit={find} className="flex flex-col gap-2">
            <label htmlFor="restore-address" className="text-sm font-semibold text-muted">{UI.restore.addressLabel}</label>
            <div className="flex gap-2.5">
              <input
                id="restore-address" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="0x"
                autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={invalid}
                className="min-h-11 min-w-0 flex-1 rounded-control bg-panel px-3 font-mono text-[15px] text-white"
              />
              <button type="submit" className="btn ghost">{UI.restore.find}</button>
            </div>
          </form>

          {err && <ErrorBox>{err}</ErrorBox>}

          {address && q.isPending && <Skeleton className="h-16" />}
          {!!q.data?.length && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-soft">{UI.restore.choose}</span>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {q.data.map((b) => {
                  const kind = backupKind(b.vault);
                  const busy = restore.isPending && restore.variables?.vault === b.vault;
                  return (
                    <li key={b.id}>
                      <button
                        type="button" aria-label={`${UI.restore.use}: ${kind}`} disabled={restore.isPending}
                        onClick={() => address && restore.mutate({ address, vault: b.vault })}
                        className={`flex w-full items-center justify-between gap-2.5 rounded-panel bg-panel p-4 text-left ${busy ? "busy" : ""}`}
                      >
                        <span className="flex flex-col">
                          <b>{kind}</b>
                          <span className="text-sm text-muted">{fill(UI.backup.added, { date: shortDate(b.createdAt) })}</span>
                        </span>
                        <span className="btn gold sm">{busy ? <><Spinner size={16} />{UI.restore.restoring}</> : UI.restore.use}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

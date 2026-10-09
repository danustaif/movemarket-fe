import { AlertIcon, Spinner } from "./Spinner.tsx";
import { useToasts, type ToastKind } from "./toast.ts";

const look: Record<ToastKind, string> = {
  ok: "bg-white text-ink",
  error: "bg-err-surface text-err-text shadow-[inset_0_0_0_1px_var(--color-err-line)]",
  pending: "bg-panel text-white",
  info: "bg-panel text-white",
};

function Icon({ kind }: { kind: ToastKind }) {
  if (kind === "pending") return <Spinner size={20} accent="text-gold" />;
  if (kind === "error") return <AlertIcon className="text-err-icon" />;
  if (kind === "info") return <AlertIcon className="text-muted" />;
  return (
    <svg className="flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="fill-gold" cx="12" cy="12" r="10" />
      <path className="stroke-ink" d="M7.5 12.5l3 3 6-7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Di atas tab bar mobile, kanan bawah di desktop. */
export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[76px] z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]">
      {items.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pop pointer-events-auto flex items-center gap-3 rounded-panel px-4 py-3 font-semibold shadow-[0_18px_50px_rgb(0_0_0/.35)] ${look[t.kind]}`}>
          <Icon kind={t.kind} />
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button type="button" className="btn gold sm" onClick={t.action.run}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}

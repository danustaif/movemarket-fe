// Buat akun passkey: penjelasan, langkah (passkey, faucet, approve), error dari COPY.errors.
import { Link, createRoute, useNavigate } from "@tanstack/react-router";
import { COPY, UI } from "../components/common/copy.ts";
import { LockIcon, Spinner } from "../components/common/Spinner.tsx";
import { ErrorBox } from "../components/common/States.tsx";
import { errorMessage } from "../lib/errors.ts";
import { rootRoute } from "./__root.tsx";
import { useAccountView, useCreateAccount } from "./-wiring.ts";

export const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/onboarding", component: Onboarding });

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Onboarding() {
  const acct = useAccountView();
  const create = useCreateAccount();
  const navigate = useNavigate();
  const done = create.isSuccess || (acct.status === "unlocked" && !create.isPending && !create.isError);
  // Langkah aktif dari useCreateAccount F1: passkey -> faucet -> approve -> done.
  const active = done ? 3 : create.step ? ["passkey", "faucet", "approve", "done"].indexOf(create.step) : -1;
  const err = create.error ? (errorMessage(create.error) ?? UI.generic.error) : null;

  return (
    <section aria-labelledby="onb-h" className="mx-auto flex max-w-[560px] flex-col gap-4.5">
      <div className="flex flex-col gap-2">
        <h1 id="onb-h" className="display m-0 text-[40px] leading-[0.95] sm:text-[56px]" style={{ fontStretch: "70%" }}>{UI.onboarding.title}</h1>
        <p className="m-0 text-[17px] text-soft">{UI.onboarding.lede}</p>
      </div>

      <ol aria-label={UI.onboarding.title} className="m-0 list-none overflow-hidden rounded-panel bg-panel p-0">
        {UI.onboarding.steps.map((step, i) => {
          const state = i < active ? "done" : i === active && create.isPending ? "busy" : i === active && create.isError ? "fail" : "todo";
          return (
            <li key={step} aria-current={state === "busy" ? "step" : undefined} className="flex items-center gap-3.5 border-t border-[#1d5a51] p-4 first:border-t-0">
              <span className={`inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[15px] font-extrabold ${
                state === "done" ? "bg-gold text-ink" : state === "busy" ? "bg-soft text-ink" : state === "fail" ? "bg-err-surface text-err-text" : "bg-deep text-muted"}`}>
                {state === "done" ? <Check /> : state === "busy" ? <Spinner size={16} /> : i + 1}
              </span>
              <span className={`text-[17px] font-extrabold ${state === "todo" ? "text-soft" : ""}`}>{step}</span>
            </li>
          );
        })}
      </ol>

      {err && <ErrorBox>{err}</ErrorBox>}

      <div className="flex flex-col gap-3">
        {done ? (
          <>
            <p role="status" className="m-0 text-[17px] font-bold text-gold">{UI.onboarding.ready}</p>
            <button type="button" className="btn gold lg" onClick={() => navigate({ to: "/" })}>{UI.home.watch}</button>
          </>
        ) : acct.status === "locked" ? (
          <button type="button" className={`btn gold lg ${acct.unlocking ? "busy" : ""}`} onClick={acct.unlock} disabled={acct.unlocking}>
            {acct.unlocking ? <Spinner /> : <LockIcon />}{COPY.actions.unlock}
          </button>
        ) : (
          <button type="button" className={`btn gold lg ${create.isPending ? "busy" : ""}`} onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Spinner size={20} />}
            {create.isPending ? UI.onboarding.settingUp : create.isError ? COPY.actions.retry : COPY.actions.createAccount}
          </button>
        )}
        {!done && <Link to="/" className="link self-center">{UI.onboarding.watchFirst}</Link>}
      </div>
      <p className="m-0 text-[13px] text-muted">{UI.onboarding.note}</p>
    </section>
  );
}

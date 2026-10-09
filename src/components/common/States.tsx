// Empty, error, skeleton, dan banner global (USER_FLOW.md bagian 8, DESIGN.md "Banner").
import type { ReactNode } from "react";
import { AlertIcon, Spinner } from "./Spinner.tsx";

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-panel bg-deep p-4 text-soft sm:p-5">
      <span className="flex-[1_1_240px]">{children}</span>
      {action}
    </div>
  );
}

/** Error di atas teal: permukaan #3b1416, teks #ffd2cf. */
export function ErrorBox({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel bg-err-surface px-4 py-3.5 text-err-text shadow-[inset_0_0_0_1px_var(--color-err-line)]">
      <AlertIcon color="#ff9c94" />
      <span className="flex-[1_1_220px] font-semibold">{children}</span>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-panel bg-panel ${className}`} />;
}

type BannerTone = "amber" | "panel" | "white";
const tone: Record<BannerTone, string> = {
  amber: "bg-amber text-ink",
  panel: "bg-panel text-white",
  white: "bg-white text-ink",
};

export function Banner({ kind, busy, children, action }: { kind: BannerTone; busy?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={tone[kind]}>
      <div className="mx-auto flex max-w-[1380px] flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-2.5 font-bold sm:px-7">
        {busy ? <Spinner /> : kind === "amber" ? <AlertIcon /> : null}
        <span className="flex-[1_1_220px]">{children}</span>
        {action}
      </div>
    </div>
  );
}

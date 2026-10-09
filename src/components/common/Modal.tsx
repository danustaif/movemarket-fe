// <dialog> modal native (DESIGN.md: dialog di desktop, bottom sheet di mobile). Escape dan klik backdrop menutup lewat onClose.
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ labelledBy, onClose, dark, children }: { labelledBy: string; onClose(): void; dark?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Tanpa cleanup close(): di StrictMode close() memicu onClose dan langsung menutup dialog. Unmount sudah melepasnya.
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref} aria-labelledby={labelledBy} className={`sheet pop ${dark ? "dark" : ""}`}
      onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {children}
    </dialog>
  );
}

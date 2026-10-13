// State akun (Zustand). LocalAccount hanya di memori; saat terkunci hanya alamat dari marker yang diketahui.
// Sesi tersimpan (D26) dipulihkan saat modul dimuat: "restoring" -> "unlocked" tanpa passkey, atau -> "locked".
import { create } from "zustand";
import type { AccountState } from "../contracts/account.ts";
import { accountService } from "../lib/account/mera.ts";

const lockedState = () => {
  const m = accountService.marker();
  return { status: m ? ("locked" as const) : ("none" as const), address: m?.address, account: undefined, mismatch: false };
};

/** Naik setiap perubahan status eksplisit; hasil restore yang terlambat (setelah lock/unlock) dibuang. */
let generation = 0;

export const useAccountStore = create<AccountState>()((set) => ({
  ...lockedState(),
  setUnlocked: (account) => {
    generation++;
    set({ status: "unlocked", account, address: account.address, mismatch: false });
  },
  lock: () => {
    generation++;
    accountService.end();
    set(lockedState());
  },
  markMismatch: () => set({ mismatch: true }),
  startOver: () => {
    generation++;
    accountService.clearMarker();
    accountService.end();
    set(lockedState());
  },
  restore: async () => {
    if (!accountService.hasSession()) return;
    const gen = ++generation;
    set({ ...lockedState(), status: "restoring" });
    const account = await accountService.restore();
    if (gen !== generation) return;
    set(account ? { status: "unlocked", account, address: account.address, mismatch: false } : lockedState());
  },
}));

void useAccountStore.getState().restore();

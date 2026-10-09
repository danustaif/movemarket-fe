// State akun (Zustand). LocalAccount hanya di memori; saat terkunci hanya alamat dari marker yang diketahui.
import { create } from "zustand";
import type { AccountState } from "../contracts/account.ts";
import { accountService } from "../lib/account/mera.ts";

const lockedState = () => {
  const m = accountService.marker();
  return { status: m ? ("locked" as const) : ("none" as const), address: m?.address, account: undefined, mismatch: false };
};

export const useAccountStore = create<AccountState>()((set) => ({
  ...lockedState(),
  setUnlocked: (account) => set({ status: "unlocked", account, address: account.address, mismatch: false }),
  lock: () => {
    accountService.end();
    set(lockedState());
  },
  markMismatch: () => set({ mismatch: true }),
  startOver: () => {
    accountService.clearMarker();
    accountService.end();
    set(lockedState());
  },
}));

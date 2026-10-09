// Sambungan route ke hook F1 (queries/, mutations/, stores/). Di sini hanya komposisi untuk tampilan:
// view model akun, banner status, dan toast error. Logika data tetap di lapisan F1.
import type { UseMutationResult } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Address } from "viem";
import { create } from "zustand";
import { COPY, UI } from "../components/common/copy.ts";
import { toast } from "../components/common/toast.ts";
import { errorCode, errorMessage } from "../lib/errors.ts";
import { useBet as useBetRaw, useCreateAccount, useClaim as useClaimRaw, useClaimMany as useClaimManyRaw, useRefund as useRefundRaw, useUnlockAccount } from "../mutations/index.ts";
import { useBalance, useChainTime, useGames, usePositions as usePositionsRaw } from "../queries/index.ts";
import { useAccountStore } from "../stores/account.ts";
import { useSseStore } from "../stores/sse.ts";

export { useCreateAccount };
export { useGame, useGames, useLeaderboard, usePayouts } from "../queries/index.ts";

// ----------------------------------------------------------------- error -> toast

/** Toast pesan COPY.errors. Isi ulang gas ditangani TxSender (satu panggilan faucet per transaksi). */
export function toastError(err: unknown) {
  toast("error", errorMessage(err) ?? UI.generic.error);
}

/** Bungkus mutation F1: error selalu jadi toast. */
function withToast<D, V, C>(m: UseMutationResult<D, Error, V, C>) {
  return {
    ...m,
    mutate: (v: V, opts?: { onSuccess?(): void }) => m.mutate(v, { onError: toastError, onSuccess: opts?.onSuccess }),
  };
}
export const useBet = () => withToast(useBetRaw());
export const useClaim = () => withToast(useClaimRaw());
export const useClaimMany = () => withToast(useClaimManyRaw());
export const useRefund = () => withToast(useRefundRaw());

// ----------------------------------------------------------------- akun

/** Sesi berakhir: transisi unlocked -> locked selama halaman terbuka (banner SESSION_ENDED). */
const useSessionEnded = create<{ ended: boolean }>(() => ({ ended: false }));
useAccountStore.subscribe((s, prev) => {
  if (prev.status === "unlocked" && s.status === "locked") useSessionEnded.setState({ ended: true });
  if (s.status === "unlocked") useSessionEnded.setState({ ended: false });
});

export function useAccountView() {
  const status = useAccountStore((s) => s.status);
  const address = useAccountStore((s) => s.address);
  const mismatch = useAccountStore((s) => s.mismatch);
  const balance = useBalance(status === "unlocked" ? address : undefined).data;
  const unlock = useUnlockAccount();
  const navigate = useNavigate();
  /** ACCOUNT_MISMATCH: akun itu tidak dipakai; mulai dari awal di /onboarding (USER_FLOW bagian 8). */
  const startOver = () => {
    useAccountStore.getState().startOver();
    void navigate({ to: "/onboarding" });
  };
  return {
    status,
    address,
    balance,
    mismatch,
    startOver,
    unlocking: unlock.isPending,
    unlock: () =>
      unlock.mutate(undefined, {
        onError: (err) =>
          errorCode(err) === "ACCOUNT_MISMATCH"
            ? toast("error", COPY.errors.ACCOUNT_MISMATCH, { label: COPY.actions.createAccount, run: startOver })
            : toastError(err),
      }),
  };
}

/** Tombol Get test tokens: useCreateAccount F1 idempoten (lewati passkey kalau terbuka, faucet, approve). */
export function useGetTokens() {
  const m = useCreateAccount();
  return () => m.mutate(undefined, { onError: toastError });
}

export const usePositions = (address: Address | undefined) => usePositionsRaw(address).data;
export const usePositionsQuery = usePositionsRaw;
export const useChainOffset = () => useChainTime().data ?? 0;

// ----------------------------------------------------------------- status global

export function useAppStatus() {
  const sse = useSseStore((s) => s.status);
  const games = useGames();
  const sessionEnded = useSessionEnded((s) => s.ended);
  const { unlock } = useAccountView();
  return { sse, resolverOffline: games.isError, sessionEnded, unlock };
}

/** Teks home.replayStarting tampil sampai replay muncul di daftar partai. */
export function useReplayStarting(): boolean {
  const gameRef = useSseStore((s) => s.replayStarting);
  const clear = useSseStore((s) => s.clearReplayStarting);
  const listed = useGames().data?.some((g) => g.gameRef === gameRef) ?? false;
  useEffect(() => { if (gameRef && listed) clear(); }, [gameRef, listed, clear]);
  return !!gameRef && !listed;
}

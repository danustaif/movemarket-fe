// Mutation hook (FRONTEND.md bagian 5). Pesan error untuk toast: errorMessage(mutation.error) dari lib/errors.ts.
import { SOT } from "@movemarket/shared";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { maxUint256, type LocalAccount, type TransactionReceipt } from "viem";
import { AccountError } from "../contracts/account.ts";
import { qk, type Game, type Position } from "../contracts/data.ts";
import type { MutationVars } from "../contracts/ui.ts";
import { accountService } from "../lib/account/mera.ts";
import { txSenderFor } from "../lib/account/session.ts";
import { publicClient } from "../lib/chain.ts";
import { AppError, errorCode } from "../lib/errors.ts";
import { resolver, ResolverError } from "../lib/resolver.ts";
import { allowanceQuery, balanceQuery } from "../queries/index.ts";
import { useAccountStore } from "../stores/account.ts";

function activeAccount(): LocalAccount {
  const a = useAccountStore.getState().account;
  if (!a) throw new AccountError("SESSION_ENDED");
  return a;
}

/** Sesi Mera berakhir: kembali ke status terkunci (USER_FLOW bagian 8). */
function lockIfSessionEnded(err: unknown) {
  if (errorCode(err) === "SESSION_ENDED") useAccountStore.getState().lock();
}

function invalidateWallet(qc: QueryClient, address: string | undefined) {
  if (!address) return;
  void qc.invalidateQueries({ queryKey: qk.positions(address) });
  void qc.invalidateQueries({ queryKey: qk.balance(address) });
  void qc.invalidateQueries({ queryKey: qk.allowance(address) });
  void qc.invalidateQueries({ queryKey: ["payouts", address.toLowerCase()] });
}

// ----------------------------------------------------------------- akun

export type CreateAccountStep = "passkey" | "faucet" | "approve" | "done" | null;

/**
 * Mera create + POST /faucet + approveMax (D21). Idempoten untuk "Try again": kalau akun sudah terbuka,
 * langkah passkey dilewati; faucet 429 (sudah diterima) lanjut ke approve.
 */
export function useCreateAccount() {
  const qc = useQueryClient();
  const [step, setStep] = useState<CreateAccountStep>(null);
  const mutation = useMutation<void, Error, MutationVars["useCreateAccount"]>({
    mutationFn: async () => {
      let account = useAccountStore.getState().account;
      if (!account) {
        setStep("passkey");
        account = await accountService.create();
        useAccountStore.getState().setUnlocked(account);
      }
      setStep("faucet");
      const sender = txSenderFor(account);
      try {
        const { usdcTx, monTx } = await resolver.faucet(account.address);
        const funded = await publicClient.waitForTransactionReceipt({ hash: monTx ?? usdcTx });
        sender.markFunded(funded.blockNumber);
      } catch (e) {
        if (!(e instanceof ResolverError && e.status === 429)) throw e instanceof ResolverError && e.code ? e : new AppError("FAUCET_FAILED");
      }
      void qc.invalidateQueries({ queryKey: qk.balance(account.address) });
      if (SOT.frontend.approveDuringOnboarding) {
        const allowance = await qc.fetchQuery({ ...allowanceQuery(account.address), staleTime: 0 });
        if (allowance < maxUint256 / 2n) {
          setStep("approve");
          await sender.approveMax();
        }
      }
      setStep("done");
    },
    onError: lockIfSessionEnded,
    onSettled: () => invalidateWallet(qc, useAccountStore.getState().address),
  });
  return { ...mutation, step };
}

export function useUnlockAccount() {
  return useMutation<void, Error, MutationVars["useUnlockAccount"]>({
    mutationFn: async () => {
      useAccountStore.getState().setUnlocked(await accountService.unlock());
    },
    onError: (err) => {
      if (errorCode(err) === "ACCOUNT_MISMATCH") useAccountStore.getState().markMismatch();
    },
  });
}

// ----------------------------------------------------------------- stake

type BetVars = MutationVars["useBet"];

/** Optimistic pool di qk.game(gameRef); rollback saat gagal. Pesan: errorMessage(error). */
export function useBet() {
  const qc = useQueryClient();
  return useMutation<TransactionReceipt, Error, BetVars, { prev?: Game }>({
    mutationFn: async ({ marketId, yes, amount }) => {
      const account = activeAccount();
      const balance = await qc.fetchQuery(balanceQuery(account.address));
      if (balance < amount) throw new AppError("INSUFFICIENT_USDC");
      const sender = txSenderFor(account);
      // Cadangan kalau approve onboarding gagal: approve dulu, lalu stake.
      const allowance = await qc.fetchQuery(allowanceQuery(account.address));
      if (allowance < amount) await sender.approveMax();
      return sender.liveMarket("bet", [marketId, yes, amount]);
    },
    onMutate: async ({ gameRef, marketId, yes, amount }) => {
      const key = qk.game(gameRef);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Game>(key);
      qc.setQueryData<Game>(key, (g) =>
        g && {
          ...g,
          markets: g.markets.map((m) =>
            m.id === marketId ? { ...m, poolYes: m.poolYes + (yes ? amount : 0n), poolNo: m.poolNo + (yes ? 0n : amount) } : m,
          ),
        },
      );
      return { prev };
    },
    onError: (err, v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.game(v.gameRef), ctx.prev);
      lockIfSessionEnded(err);
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: qk.game(v.gameRef) });
      invalidateWallet(qc, useAccountStore.getState().address);
    },
  });
}

// ----------------------------------------------------------------- claim / refund

/**
 * Claim/refund dengan optimistic "settled" di qk.positions. Tombol hanya diaktifkan dari usePayouts
 * (canClaim/canRefund, tag finalized); hook ini tidak mengecek ulang.
 */
function useSettle<V>(send: (account: LocalAccount, v: V) => Promise<TransactionReceipt>, ids: (v: V) => bigint[]) {
  const qc = useQueryClient();
  return useMutation<TransactionReceipt, Error, V, { prev?: Position[] }>({
    mutationFn: (v) => send(activeAccount(), v),
    onMutate: async (v) => {
      const address = useAccountStore.getState().address;
      if (!address) return {};
      const key = qk.positions(address);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Position[]>(key);
      const set = new Set(ids(v));
      qc.setQueryData<Position[]>(key, (ps) => ps?.map((p) => (set.has(p.marketId) ? { ...p, settled: true, claimable: 0n } : p)));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      const address = useAccountStore.getState().address;
      if (address && ctx?.prev) qc.setQueryData(qk.positions(address), ctx.prev);
      lockIfSessionEnded(err);
    },
    onSettled: () => invalidateWallet(qc, useAccountStore.getState().address),
  });
}

export const useClaim = () =>
  useSettle<MutationVars["useClaim"]>((a, v) => txSenderFor(a).liveMarket("claim", [v.marketId]), (v) => [v.marketId]);

export const useClaimMany = () =>
  useSettle<MutationVars["useClaimMany"]>((a, v) => txSenderFor(a).liveMarket("claimMany", [v.marketIds]), (v) => v.marketIds);

export const useRefund = () =>
  useSettle<MutationVars["useRefund"]>((a, v) => txSenderFor(a).liveMarket("refund", [v.marketId]), (v) => [v.marketId]);

// Pengirim transaksi pengguna dengan aturan Monad (SOT 13, 13a, D21). Lihat kontrak TxSender.
import { GAS_LIMITS, liveMarketAbi, mockUsdcAbi, SOT, type GasLimitName } from "@movemarket/shared";
import {
  createWalletClient,
  http,
  InsufficientFundsError,
  maxUint256,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  NonceTooHighError,
  NonceTooLowError,
  nonceManager,
  UnsupportedProviderMethodError,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import type { TxSender, UserWrite } from "../../contracts/account.ts";
import { chain, contracts, publicClient } from "../chain.ts";
import { resolver, ResolverError } from "../resolver.ts";

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

type Limits = Record<GasLimitName, number | null>;

/** Gas limit eksplisit dari SOT (Monad menagih limit). null = belum diukur, jangan kirim. */
export function gasFor(name: GasLimitName, limits: Limits = GAS_LIMITS): bigint {
  const g = limits[name];
  if (g == null) throw new Error(`gas limit for "${name}" is not set in sot/constants.json gas.limits`);
  return BigInt(g);
}

/** Gas per panggilan pengguna. claimMany adalah fungsi batch: base + perMarket x jumlah pasar (SOT bagian 13). */
export function callGas(fn: UserWrite, args: readonly unknown[], limits: Limits = GAS_LIMITS): bigint {
  if (fn !== "claimMany") return gasFor(fn, limits);
  const n = BigInt((args[0] as readonly unknown[]).length);
  return gasFor("claimManyBase", limits) + gasFor("claimManyPerMarket", limits) * n;
}

const hasCause = (e: unknown, match: (x: unknown) => boolean): boolean => {
  for (let x = e, i = 0; x instanceof Error && i < 10; x = x.cause, i++) if (match(x)) return true;
  return false;
};
const syncUnsupported = (e: unknown) =>
  hasCause(e, (x) => x instanceof MethodNotFoundRpcError || x instanceof MethodNotSupportedRpcError || x instanceof UnsupportedProviderMethodError);
const outOfGas = (e: unknown) => hasCause(e, (x) => x instanceof InsufficientFundsError);
const nonceClash = (e: unknown) => hasCause(e, (x) => x instanceof NonceTooLowError || x instanceof NonceTooHighError);

export interface TxSenderDeps {
  account: LocalAccount;
  publicClient: Pick<PublicClient, "simulateContract" | "getBlockNumber" | "waitForTransactionReceipt">;
  walletClient: Pick<WalletClient<Transport, Chain, LocalAccount>, "writeContractSync" | "writeContract">;
  addresses: { liveMarket: Address; mockUsdc: Address };
  faucetGas: (address: Address) => Promise<{ monTx: Hex }>;
  clock?: Clock;
}

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; gas: bigint };

export function createTxSender(deps: TxSenderDeps): TxSender & { markFunded(blockNumber: bigint): void } {
  const { account, publicClient: pc, walletClient: wc, clock = realClock } = deps;
  let tail: Promise<unknown> = Promise.resolve();
  let lastIncludedAt = -Infinity;
  let pending = 0;
  let fundedAt: bigint | undefined;

  async function waitFunding() {
    if (fundedAt === undefined) return;
    // Async execution: dana baru bisa dipakai setelah berumur postFundingWaitBlocks blok.
    const target = fundedAt + BigInt(SOT.frontend.postFundingWaitBlocks);
    while ((await pc.getBlockNumber({ cacheTime: 0 })) < target) await clock.sleep(SOT.network.blockTimeMs);
    fundedAt = undefined;
  }

  async function sendOnce(c: Call): Promise<TransactionReceipt> {
    await waitFunding();
    // Simulasi dulu: revert (BettingClosed, StakeCapExceeded, ...) terbaca dengan nama error, tanpa membakar gas limit.
    await pc.simulateContract({ ...c, account } as never);
    const req = { ...c, account, chain } as never;
    try {
      return await wc.writeContractSync(req);
    } catch (e) {
      if (!syncUnsupported(e)) throw e;
      const hash = await wc.writeContract(req);
      const receipt = await pc.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error(`transaction ${hash} reverted`);
      return receipt;
    }
  }

  async function send(c: Call): Promise<TransactionReceipt> {
    let refilled = false;
    let renonced = false;
    for (;;) {
      try {
        return await sendOnce(c);
      } catch (e) {
        // Nonce yang sudah dikonsumsi tx gagal membuat tx berikutnya macet; ambil ulang dari chain.
        nonceManager.reset({ address: account.address, chainId: chain.id });
        if (outOfGas(e) && !refilled) {
          refilled = true;
          // 429 GAS_TOPUP_LIMIT dilempar apa adanya; kegagalan faucet lain: tampilkan INSUFFICIENT_GAS asli.
          const { monTx } = await deps.faucetGas(account.address).catch((fe: unknown) => {
            throw fe instanceof ResolverError && fe.code ? fe : e;
          });
          fundedAt = (await pc.waitForTransactionReceipt({ hash: monTx })).blockNumber;
          continue;
        }
        if (nonceClash(e) && !renonced) {
          renonced = true;
          continue;
        }
        throw e;
      }
    }
  }

  function enqueue(c: Call): Promise<TransactionReceipt> {
    pending++;
    const job = tail.then(async () => {
      const wait = lastIncludedAt + SOT.frontend.minTxGapMs - clock.now();
      if (wait > 0) await clock.sleep(wait);
      try {
        return await send(c);
      } finally {
        lastIncludedAt = clock.now();
      }
    });
    tail = job.catch(() => undefined);
    return job.finally(() => void pending--);
  }

  return {
    busy: () => pending > 0,
    markFunded(blockNumber) {
      fundedAt = blockNumber;
    },
    liveMarket: (fn, args) =>
      enqueue({ address: deps.addresses.liveMarket, abi: liveMarketAbi, functionName: fn, args: args as readonly unknown[], gas: callGas(fn, args as readonly unknown[]) }),
    approveMax: () =>
      enqueue({
        address: deps.addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [deps.addresses.liveMarket, maxUint256],
        gas: gasFor("approve"),
      }),
  };
}

const senders = new WeakMap<LocalAccount, ReturnType<typeof createTxSender>>();

/** Satu TxSender (satu antrian) per akun aktif. */
export function txSenderFor(account: LocalAccount): ReturnType<typeof createTxSender> {
  let s = senders.get(account);
  if (!s) {
    s = createTxSender({
      account,
      publicClient,
      walletClient: createWalletClient({ account, chain, transport: http(import.meta.env.VITE_RPC_URL || undefined) }),
      addresses: contracts(),
      faucetGas: resolver.faucetGas,
    });
    senders.set(account, s);
  }
  return s;
}

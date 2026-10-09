// Kontrak akun (Mera passkey) dan pengiriman transaksi. Spesifikasi: source/docs/FRONTEND.md bagian 3 dan 5,
// source/docs/SOT.md bagian 12 dan 13a.
import type { liveMarketAbi, Copy } from "@movemarket/shared";
import type { Address, ContractFunctionArgs, ContractFunctionName, LocalAccount, TransactionReceipt } from "viem";

/** Satu-satunya yang disimpan di localStorage key SOT.account.storageKey ("movemarket.account.v1"). */
export interface StoredMarker {
  rpId: string;
  address: Address;
  credentialId: string;
}

/** Error akun yang ditampilkan UI; teks di copy.errors[code]. */
export type AccountErrorCode = Extract<
  keyof Copy["errors"],
  "PRF_UNAVAILABLE" | "PASSKEY_CANCELLED" | "UNLOCK_CANCELLED" | "CRYPTO_UNAVAILABLE" | "SESSION_ENDED" | "ACCOUNT_MISMATCH"
>;

/**
 * lib/account/mera.ts. Derivasi: PRF 32 byte -> BIP-39 24 kata -> seed -> m/44'/60'/0'/0/0 -> sesi Mera
 * -> toViemAccount. prfOutput, seed, privateKey di-fill(0) setelah sesi dibuat; mnemonic tidak pernah disimpan.
 * Semua kegagalan dilempar sebagai AccountError.
 */
export interface AccountService {
  /** Buat passkey baru (rp.id = VITE_RP_ID), simpan marker. */
  create(): Promise<LocalAccount>;
  /** Buka passkey dari marker. Alamat hasil derivasi != marker -> ACCOUNT_MISMATCH. */
  unlock(): Promise<LocalAccount>;
  marker(): StoredMarker | null;
  clearMarker(): void;
}

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode) {
    super(code);
    this.code = code;
  }
}

/** stores/account.ts (Zustand). account hanya di memori. */
export interface AccountState {
  status: "none" | "locked" | "unlocked";
  address?: Address;
  account?: LocalAccount;
  setUnlocked(a: LocalAccount): void;
  lock(): void;
}

// ----------------------------------------------------------------- transaksi

type LiveMarketAbi = typeof liveMarketAbi;
export type LiveMarketWrite = ContractFunctionName<LiveMarketAbi, "nonpayable">;
export type UserWrite = Extract<LiveMarketWrite, "bet" | "claim" | "claimMany" | "refund">;

/**
 * lib/account/session.ts. Menyembunyikan aturan Monad dari pemanggil:
 * - gas eksplisit dari SOT.gas.limits (Monad menagih gas limit)
 * - writeContractSync (eth_sendRawTransactionSync), cadangan writeContract + waitForTransactionReceipt
 * - antrian: jeda SOT.frontend.minTxGapMs antar transaksi (akun < 10 MON: 1 tx per 3 blok)
 * - setelah faucet, transaksi pertama menunggu SOT.frontend.postFundingWaitBlocks blok
 * Revert kontrak dilempar dengan nama custom error ABI (lihat errorMessage).
 */
export interface TxSender {
  liveMarket<F extends UserWrite>(fn: F, args: ContractFunctionArgs<LiveMarketAbi, "nonpayable", F>): Promise<TransactionReceipt>;
  /** approve(LiveMarket, maxUint256), dikirim sekali saat onboarding (SOT D21). */
  approveMax(): Promise<TransactionReceipt>;
  /** true selama antrian menahan transaksi (tombol menampilkan "sending"). */
  busy(): boolean;
}

/** Nama custom error -> copy.errors[nama]. Tidak dikenal -> null (toast generik). */
export type ContractErrorMessage = (err: unknown) => string | null;

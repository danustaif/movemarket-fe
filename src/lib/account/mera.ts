// Akun dari passkey Mera (SOT bagian 12, D13). Kunci hanya di memori; yang disimpan hanya marker.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { COPY, SOT } from "@movemarket/shared";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { nonceManager, type LocalAccount } from "viem";
import { AccountError, type AccountErrorCode, type AccountService, type StoredMarker } from "../../contracts/account.ts";

type MasterFromSeed = (seed: Uint8Array) => Pick<HDKey, "derive" | "wipePrivateData">;

/**
 * PRF -> BIP-39 -> seed -> m/44'/60'/0'/0/0. seed dan kunci HD di-zero-kan di semua jalur, termasuk saat melempar;
 * pemanggil zero-kan hasilnya. `fromMasterSeed` hanya diganti di test.
 */
export function deriveEvmPrivateKey(prfOutput: Uint8Array, fromMasterSeed: MasterFromSeed = (s) => HDKey.fromMasterSeed(s)): Uint8Array {
  let seed: Uint8Array | undefined;
  let master: ReturnType<MasterFromSeed> | undefined;
  let child: HDKey | undefined;
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    master = fromMasterSeed(seed);
    child = master.derive(SOT.account.derivationPath);
    if (!child.privateKey) throw new Error("HD derivation returned no private key");
    return child.privateKey.slice();
  } finally {
    child?.wipePrivateData();
    master?.wipePrivateData();
    seed?.fill(0);
  }
}

/** Sesi Mera + akun viem dari output PRF. prfOutput dan privateKey di-zero-kan, juga saat gagal. */
export function accountFromPrf(prfOutput: Uint8Array): { session: Secp256k1SigningSession; account: LocalAccount } {
  let privateKey: Uint8Array | undefined;
  try {
    privateKey = deriveEvmPrivateKey(prfOutput);
    const session = createSecp256k1SigningSession({ privateKey });
    return { session, account: toViemAccount(session, { nonceManager }) };
  } finally {
    privateKey?.fill(0);
    prfOutput.fill(0);
  }
}

export interface MeraDeps {
  rpId: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  createPasskeyWithPrfOutput: typeof createPasskeyWithPrfOutput;
  getPasskeyPrfOutput: typeof getPasskeyPrfOutput;
}

const PASSTHROUGH = new Set<string>(["PRF_UNAVAILABLE", "CRYPTO_UNAVAILABLE", "SESSION_ENDED"]);

function toAccountError(e: unknown, cancelled: AccountErrorCode): AccountError {
  if (e instanceof AccountError) return e;
  if (isMeraError(e) && PASSTHROUGH.has(e.code)) return new AccountError(e.code as AccountErrorCode);
  // PASSKEY_OPERATION_FAILED (termasuk pembatalan) dan sisanya: pengguna bisa mencoba lagi.
  return new AccountError(cancelled);
}

export function createAccountService(deps: MeraDeps): AccountService & { end(): void } {
  const key = SOT.account.storageKey;
  let active: Secp256k1SigningSession | undefined;

  const activate = (prfOutput: Uint8Array) => {
    const { session, account } = accountFromPrf(prfOutput);
    active?.end();
    active = session;
    return account;
  };

  const marker = (): StoredMarker | null => {
    try {
      return JSON.parse(deps.storage.getItem(key) ?? "null") as StoredMarker | null;
    } catch {
      return null;
    }
  };

  return {
    marker,
    clearMarker: () => deps.storage.removeItem(key),
    /** Akhiri sesi aktif: kunci sesi di Mera di-zero-kan, tanda tangan berikutnya melempar SESSION_ENDED. */
    end() {
      active?.end();
      active = undefined;
    },
    async create() {
      try {
        const res = await deps.createPasskeyWithPrfOutput({
          rp: { id: deps.rpId, name: COPY.brand.name },
          user: { name: COPY.brand.name, displayName: COPY.brand.name },
        });
        const account = activate(res.prfOutput);
        const m: StoredMarker = { rpId: deps.rpId, address: account.address, credentialId: res.credentialId };
        deps.storage.setItem(key, JSON.stringify(m));
        return account;
      } catch (e) {
        throw toAccountError(e, "PASSKEY_CANCELLED");
      }
    },
    async unlock() {
      try {
        const m = marker();
        const res = await deps.getPasskeyPrfOutput({
          rpId: deps.rpId,
          credential: m ? { credentialId: m.credentialId } : undefined,
        });
        const account = activate(res.prfOutput);
        if (m && account.address.toLowerCase() !== m.address.toLowerCase()) {
          active?.end();
          active = undefined;
          throw new AccountError("ACCOUNT_MISMATCH");
        }
        // Tanpa marker (storage dihapus): passkey yang dipilih browser menjadi akun perangkat ini.
        if (!m) deps.storage.setItem(key, JSON.stringify({ rpId: deps.rpId, address: account.address, credentialId: res.credentialId }));
        return account;
      } catch (e) {
        throw toAccountError(e, "UNLOCK_CANCELLED");
      }
    },
  };
}

export const accountService = createAccountService({
  rpId: import.meta.env.VITE_RP_ID,
  get storage() {
    return globalThis.localStorage;
  },
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
});

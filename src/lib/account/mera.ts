// Akun dari passkey Mera (SOT bagian 12, D13, D26) dan passkey backup lewat Mera secret vault (12a, D27).
// Disimpan: marker (+ vault ciphertext di perangkat hasil pemulihan) + sesi terenkripsi (vault.ts), tidak pernah kunci terbaca.
// Kriptografi (Mera, @scure, noble) ada di prf.ts dan dimuat lazy saat create/unlock/restore.
import type {
  createPasskeyWithPrfOutput, createSecretVaultWithNewPasskey, decryptSecretVaultWithPasskey, getPasskeyPrfOutput, Secp256k1SigningSession,
} from "@category-labs/mera";
import type { Address, LocalAccount } from "viem";
import { isMeraError } from "@category-labs/mera";
import { COPY, SOT } from "@movemarket/shared";
import { fill } from "../../components/common/copy.ts";
import { AccountError, type AccountErrorCode, type AccountService, type StoredMarker } from "../../contracts/account.ts";
import { createVault, idbKeyStore, type Vault } from "./vault.ts";

const loadPrf = () => import("./prf.ts");

export interface MeraDeps {
  rpId: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  vault: Vault;
  createPasskeyWithPrfOutput: typeof createPasskeyWithPrfOutput;
  getPasskeyPrfOutput: typeof getPasskeyPrfOutput;
  createSecretVaultWithNewPasskey: typeof createSecretVaultWithNewPasskey;
  decryptSecretVaultWithPasskey: typeof decryptSecretVaultWithPasskey;
}

const PASSTHROUGH = new Set<string>(["PRF_UNAVAILABLE", "CRYPTO_UNAVAILABLE", "SESSION_ENDED"]);
const BAD_VAULT = new Set<string>(["DECRYPT_FAILED", "VAULT_FORMAT_INVALID"]);

function toAccountError(e: unknown, cancelled: AccountErrorCode): AccountError {
  if (e instanceof AccountError) return e;
  if (isMeraError(e) && PASSTHROUGH.has(e.code)) return new AccountError(e.code as AccountErrorCode);
  if (isMeraError(e) && BAD_VAULT.has(e.code)) return new AccountError("BACKUP_DECRYPT_FAILED");
  // PASSKEY_OPERATION_FAILED (termasuk pembatalan) dan sisanya: pengguna bisa mencoba lagi.
  return new AccountError(cancelled);
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createAccountService(deps: MeraDeps): AccountService & { end(): void } {
  const key = SOT.account.storageKey;
  const { vault } = deps;
  let active: Secp256k1SigningSession | undefined;

  const marker = (): StoredMarker | null => {
    try {
      return JSON.parse(deps.storage.getItem(key) ?? "null") as StoredMarker | null;
    } catch {
      return null;
    }
  };

  const end = () => {
    active?.end();
    active = undefined;
  };

  const hasSession = () => {
    const m = marker();
    const s = vault.peek();
    return !!m && !!s && sameAddress(s.address, m.address);
  };

  /** Sesi dari PRF. Kunci disegel ke vault hanya kalau alamatnya cocok dengan `expected` (atau belum ada marker). */
  const activate = async (prfOutput: Uint8Array, expected?: Address): Promise<LocalAccount> => {
    let sealing: Promise<void> | undefined;
    const { session, account } = (await loadPrf()).accountFromPrf(prfOutput, (pk, address) => {
      if (!expected || sameAddress(address, expected)) sealing = vault.seal(pk, address);
    });
    end();
    active = session;
    // Gagal menyimpan (mis. IndexedDB diblokir) tidak menggagalkan unlock: sesi hanya tidak bertahan saat refresh.
    await sealing?.catch(() => vault.clear());
    return account;
  };

  /** Entropi akun lewat passkey yang membuka akun di perangkat ini (penanda biasa: PRF passkey utama; hasil pemulihan: vault). */
  const openRoot = async (m: Pick<StoredMarker, "credentialId" | "vault">): Promise<Uint8Array> =>
    m.vault
      ? deps.decryptSecretVaultWithPasskey({ rpId: deps.rpId, vault: m.vault })
      : (await deps.getPasskeyPrfOutput({ rpId: deps.rpId, credential: { credentialId: m.credentialId } })).prfOutput;

  return {
    marker,
    clearMarker: () => deps.storage.removeItem(key),
    /** Lock: sesi Mera di-zero-kan (tanda tangan berikutnya SESSION_ENDED) dan sesi tersimpan dihapus. */
    end() {
      end();
      vault.clear();
    },
    hasSession,
    async restore() {
      const m = marker();
      if (!m || !hasSession()) {
        vault.clear();
        return null;
      }
      try {
        const pk = await vault.open();
        if (!pk) return null;
        const { session, account } = (await loadPrf()).accountFromPrivateKey(pk);
        if (!sameAddress(account.address, m.address)) {
          session.end();
          vault.clear();
          return null;
        }
        end();
        active = session;
        vault.touch();
        return account;
      } catch {
        vault.clear();
        return null;
      }
    },
    async create() {
      try {
        const res = await deps.createPasskeyWithPrfOutput({
          rp: { id: deps.rpId, name: COPY.brand.name },
          user: { name: COPY.brand.name, displayName: COPY.brand.name },
        });
        const account = await activate(res.prfOutput);
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
        // Tanpa marker: browser memilih passkey (discoverable) dan PRF-nya menjadi akun perangkat ini.
        const res = m ? { prfOutput: await openRoot(m), credentialId: m.credentialId } : await deps.getPasskeyPrfOutput({ rpId: deps.rpId });
        const account = await activate(res.prfOutput, m?.address);
        if (m && !sameAddress(account.address, m.address)) {
          end();
          vault.clear();
          throw new AccountError("ACCOUNT_MISMATCH");
        }
        // Tanpa marker (storage dihapus): passkey yang dipilih browser menjadi akun perangkat ini.
        if (!m) deps.storage.setItem(key, JSON.stringify({ rpId: deps.rpId, address: account.address, credentialId: res.credentialId }));
        return account;
      } catch (e) {
        throw toAccountError(e, "UNLOCK_CANCELLED");
      }
    },
    async createBackupVault() {
      const m = marker();
      if (!m) throw new AccountError("SESSION_ENDED");
      let secret: Uint8Array | undefined;
      try {
        secret = await openRoot(m);
        // Passkey yang dikonfirmasi harus membuka akun ini; kalau tidak, jangan buat passkey backup sama sekali.
        if (!sameAddress((await loadPrf()).addressFromEntropy(secret), m.address)) throw new AccountError("ACCOUNT_MISMATCH");
        const name = fill(COPY.ui.backup.passkeyUser, { brand: COPY.brand.name, address: m.address });
        const v = await deps.createSecretVaultWithNewPasskey({ rp: { id: deps.rpId, name: COPY.brand.name }, user: { name, displayName: name }, secret });
        return JSON.stringify(v);
      } catch (e) {
        throw toAccountError(e, "BACKUP_CANCELLED");
      } finally {
        secret?.fill(0);
      }
    },
    async restoreFromVault(address, vaultJson) {
      try {
        const v = (await loadPrf()).parseSecretVault(vaultJson);
        const secret = await deps.decryptSecretVaultWithPasskey({ rpId: deps.rpId, vault: v });
        const account = await activate(secret, address); // activate men-zero-kan secret
        if (!sameAddress(account.address, address)) {
          end();
          vault.clear();
          throw new AccountError("ACCOUNT_MISMATCH");
        }
        const m: StoredMarker = { rpId: deps.rpId, address: account.address, credentialId: v.credential.credentialId, vault: v };
        deps.storage.setItem(key, JSON.stringify(m));
        return account;
      } catch (e) {
        throw toAccountError(e, "RESTORE_CANCELLED");
      }
    },
  };
}

export const accountService = createAccountService({
  rpId: import.meta.env.VITE_RP_ID,
  get storage() {
    return globalThis.localStorage;
  },
  vault: createVault({
    get storage() {
      return globalThis.localStorage;
    },
    keys: idbKeyStore,
  }),
  createPasskeyWithPrfOutput: async (o) => (await loadPrf()).createPasskeyWithPrfOutput(o),
  getPasskeyPrfOutput: async (o) => (await loadPrf()).getPasskeyPrfOutput(o),
  createSecretVaultWithNewPasskey: async (o) => (await loadPrf()).createSecretVaultWithNewPasskey(o),
  decryptSecretVaultWithPasskey: async (o) => (await loadPrf()).decryptSecretVaultWithPasskey(o),
});

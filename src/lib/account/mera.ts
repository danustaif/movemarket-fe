// Akun dari passkey Mera (SOT bagian 12, D13, D26). Disimpan: marker + sesi terenkripsi (vault.ts), tidak pernah kunci terbaca.
// Kriptografi (Mera, @scure, noble) ada di prf.ts dan dimuat lazy saat create/unlock/restore.
import type { createPasskeyWithPrfOutput, getPasskeyPrfOutput, Secp256k1SigningSession } from "@category-labs/mera";
import type { Address, LocalAccount } from "viem";
import { isMeraError } from "@category-labs/mera";
import { COPY, SOT } from "@movemarket/shared";
import { AccountError, type AccountErrorCode, type AccountService, type StoredMarker } from "../../contracts/account.ts";
import { createVault, idbKeyStore, type Vault } from "./vault.ts";

const loadPrf = () => import("./prf.ts");

export interface MeraDeps {
  rpId: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  vault: Vault;
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
        const res = await deps.getPasskeyPrfOutput({
          rpId: deps.rpId,
          credential: m ? { credentialId: m.credentialId } : undefined,
        });
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
});

// Akun dari passkey Mera (SOT bagian 12, D13). Kunci hanya di memori; yang disimpan hanya marker.
// Kriptografi (Mera, @scure, noble) ada di prf.ts dan dimuat lazy saat create/unlock.
import type { createPasskeyWithPrfOutput, getPasskeyPrfOutput, Secp256k1SigningSession } from "@category-labs/mera";
import { isMeraError } from "@category-labs/mera";
import { COPY, SOT } from "@movemarket/shared";
import { AccountError, type AccountErrorCode, type AccountService, type StoredMarker } from "../../contracts/account.ts";

const loadPrf = () => import("./prf.ts");

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

  const activate = async (prfOutput: Uint8Array) => {
    const { session, account } = (await loadPrf()).accountFromPrf(prfOutput);
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
        const account = await activate(res.prfOutput);
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
  createPasskeyWithPrfOutput: async (o) => (await loadPrf()).createPasskeyWithPrfOutput(o),
  getPasskeyPrfOutput: async (o) => (await loadPrf()).getPasskeyPrfOutput(o),
});

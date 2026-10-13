// Sesi tersimpan (SOT bagian 12, D26). privateKey dienkripsi AES-GCM dengan CryptoKey non-extractable di IndexedDB;
// localStorage hanya memegang { address, iv, ciphertext, expiresAt }. Tanpa dependensi kripto: cukup WebCrypto.
import { SOT } from "@movemarket/shared";
import { bytesToHex, hexToBytes, isAddress, isHex, type Address, type Hex } from "viem";

export interface SealedSession {
  address: Address;
  iv: Hex;
  ciphertext: Hex;
  expiresAt: number;
}

/** Penyimpanan satu CryptoKey (structured clone). Produksi: IndexedDB; test: memori. */
export interface KeyStore {
  get(): Promise<CryptoKey | undefined>;
  put(key: CryptoKey): Promise<void>;
  del(): Promise<void>;
}

export interface VaultDeps {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  keys: KeyStore;
  now?: () => number;
}

export type Vault = ReturnType<typeof createVault>;

const TTL_MS = SOT.account.sessionTtlHours * 3_600_000;
const AES = { name: "AES-GCM", length: 256 } as const;
const bytes = (h: Hex) => new Uint8Array(hexToBytes(h)); // BufferSource butuh ArrayBuffer, bukan ArrayBufferLike

export function createVault({ storage, keys, now = Date.now }: VaultDeps) {
  const KEY = SOT.account.sessionStorageKey;

  function read(): SealedSession | null {
    try {
      const s = JSON.parse(storage.getItem(KEY) ?? "null") as SealedSession | null;
      if (s && isAddress(s.address) && isHex(s.iv) && isHex(s.ciphertext) && typeof s.expiresAt === "number") return s;
    } catch {
      // rusak: diperlakukan seperti tidak ada
    }
    return null;
  }

  function clear(): void {
    // Ciphertext dihapus sinkron (peek berikutnya langsung null); kunci AES menyusul di IndexedDB.
    storage.removeItem(KEY);
    keys.del().catch(() => undefined);
  }

  /** Sesi tersimpan yang belum kedaluwarsa (sinkron, untuk status awal). Kedaluwarsa/rusak dihapus. */
  function peek(): SealedSession | null {
    const s = read();
    if (s && s.expiresAt > now()) return s;
    if (storage.getItem(KEY) !== null) clear();
    return null;
  }

  return {
    peek,

    /** Enkripsi salinan privateKey dengan kunci AES baru. Salinan dibuat sinkron, jadi pemanggil boleh zero-kan aslinya. */
    async seal(privateKey: Uint8Array, address: Address): Promise<void> {
      const plain = privateKey.slice();
      try {
        const key = await crypto.subtle.generateKey(AES, false, ["encrypt", "decrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: AES.name, iv }, key, plain));
        await keys.put(key);
        const s: SealedSession = { address, iv: bytesToHex(iv), ciphertext: bytesToHex(ct), expiresAt: now() + TTL_MS };
        storage.setItem(KEY, JSON.stringify(s));
      } finally {
        plain.fill(0);
      }
    },

    /** privateKey hasil dekripsi (pemanggil zero-kan), atau null (sesi dihapus) kalau tidak ada/kedaluwarsa/rusak. */
    async open(): Promise<Uint8Array | null> {
      const s = peek();
      if (!s) return null;
      try {
        const key = await keys.get();
        if (!key) throw new Error("session key missing");
        return new Uint8Array(await crypto.subtle.decrypt({ name: AES.name, iv: bytes(s.iv) }, key, bytes(s.ciphertext)));
      } catch {
        clear();
        return null;
      }
    },

    /** Perpanjang masa berlaku (sliding) setelah pemulihan berhasil. */
    touch(): void {
      const s = read();
      if (s) storage.setItem(KEY, JSON.stringify({ ...s, expiresAt: now() + TTL_MS }));
    },

    clear,
  };
}

/** KeyStore IndexedDB produksi (SOT.account.sessionKeyDb). Setiap operasi membuka dan menutup DB. */
export const idbKeyStore: KeyStore = (() => {
  const { database, objectStore, key } = SOT.account.sessionKeyDb;
  const req = <T>(r: IDBRequest<T>) =>
    new Promise<T>((res, rej) => {
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const open = indexedDB.open(database, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(objectStore);
    const db = await req(open);
    try {
      return await req(f(db.transaction(objectStore, mode).objectStore(objectStore)));
    } finally {
      db.close();
    }
  }
  return {
    get: () => run("readonly", (s) => s.get(key) as IDBRequest<CryptoKey | undefined>),
    put: (k) => run("readwrite", (s) => s.put(k, key)).then(() => undefined),
    del: () => run("readwrite", (s) => s.delete(key)),
  };
})();

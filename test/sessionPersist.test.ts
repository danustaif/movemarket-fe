// Sesi tersimpan terenkripsi (SOT bagian 12, D26): bertahan saat refresh tanpa kunci privat terbaca di storage.
import { describe, expect, test } from "bun:test";
import { SOT } from "@movemarket/shared";
import { deriveEvmPrivateKey } from "../src/lib/account/prf.ts";
import { createAccountService, type MeraDeps } from "../src/lib/account/mera.ts";
import { createVault, type KeyStore } from "../src/lib/account/vault.ts";

const prf32 = () => new Uint8Array(32).map((_, i) => i + 1);
const otherPrf = () => new Uint8Array(32).fill(9);

function memStorage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function memKeys(): KeyStore & { key?: CryptoKey } {
  const s: KeyStore & { key?: CryptoKey } = {
    get: async () => s.key,
    put: async (k) => void (s.key = k),
    del: async () => void (s.key = undefined),
  };
  return s;
}

/** Satu "perangkat": storage dan IndexedDB bertahan antar refresh; service baru = state memori baru. */
function device() {
  const storage = memStorage();
  const keys = memKeys();
  const clock = { t: 1_000_000 };
  let prompts = 0;
  let prf: () => Uint8Array<ArrayBuffer> = prf32;
  const service = () =>
    createAccountService({
      rpId: "localhost",
      storage,
      vault: createVault({ storage, keys, now: () => clock.t }),
      createPasskeyWithPrfOutput: async () => (prompts++, { credentialId: "cred1", prfSalt: new Uint8Array(32), prfOutput: prf() }),
      getPasskeyPrfOutput: async () => (prompts++, { credentialId: "cred1", prfOutput: prf() }),
    } satisfies MeraDeps);
  return { storage, keys, clock, service, prompts: () => prompts, usePrf: (f: () => Uint8Array<ArrayBuffer>) => void (prf = f) };
}

const TTL_MS = SOT.account.sessionTtlHours * 3_600_000;

describe("session persistence (D26)", () => {
  test("create, then refresh: restore returns the same address without a passkey prompt", async () => {
    const d = device();
    const a = await d.service().create();
    const fresh = d.service();
    expect(fresh.hasSession()).toBe(true);
    expect((await fresh.restore())?.address).toBe(a.address);
    expect(d.prompts()).toBe(1);
  });

  test("the AES key is non-extractable and no storage value contains the private key", async () => {
    const d = device();
    await d.service().create();
    expect(d.keys.key!.extractable).toBe(false);
    expect(await crypto.subtle.exportKey("raw", d.keys.key!).then(() => "exported", () => "refused")).toBe("refused");
    const pkHex = Buffer.from(deriveEvmPrivateKey(prf32())).toString("hex");
    for (const v of d.storage.m.values()) expect(v.toLowerCase()).not.toContain(pkHex);
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(true);
  });

  test("expired session falls back to locked and is removed", async () => {
    const d = device();
    await d.service().create();
    d.clock.t += TTL_MS + 1;
    const fresh = d.service();
    expect(fresh.hasSession()).toBe(false);
    expect(await fresh.restore()).toBeNull();
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
  });

  test("restore slides the expiry forward", async () => {
    const d = device();
    await d.service().create();
    d.clock.t += TTL_MS - 1000;
    expect(await d.service().restore()).not.toBeNull();
    d.clock.t += TTL_MS - 1000;
    expect(await d.service().restore()).not.toBeNull();
  });

  test("lock (end) deletes the ciphertext and the AES key", async () => {
    const d = device();
    const svc = d.service();
    await svc.create();
    svc.end();
    await Promise.resolve();
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
    expect(d.keys.key).toBeUndefined();
    expect(await d.service().restore()).toBeNull();
    expect(d.storage.m.has(SOT.account.storageKey)).toBe(true); // marker tetap: status locked, bukan none
  });

  test("corrupted ciphertext falls back to locked without throwing", async () => {
    const d = device();
    await d.service().create();
    const rec = JSON.parse(d.storage.m.get(SOT.account.sessionStorageKey)!);
    d.storage.m.set(SOT.account.sessionStorageKey, JSON.stringify({ ...rec, ciphertext: "0x" + "00".repeat(48) }));
    expect(await d.service().restore()).toBeNull();
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
  });

  test("garbage JSON in the session slot is ignored", async () => {
    const d = device();
    await d.service().create();
    d.storage.m.set(SOT.account.sessionStorageKey, "{not json");
    expect(d.service().hasSession()).toBe(false);
    expect(await d.service().restore()).toBeNull();
  });

  test("missing AES key (IndexedDB cleared) falls back to locked", async () => {
    const d = device();
    await d.service().create();
    d.keys.key = undefined;
    expect(await d.service().restore()).toBeNull();
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
  });

  test("session sealed for another address than the marker is not restored", async () => {
    const d = device();
    await d.service().create();
    const m = JSON.parse(d.storage.m.get(SOT.account.storageKey)!);
    d.storage.m.set(SOT.account.storageKey, JSON.stringify({ ...m, address: "0x00000000000000000000000000000000000000a1" }));
    expect(await d.service().restore()).toBeNull();
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
  });

  test("ACCOUNT_MISMATCH on unlock deletes the stored session", async () => {
    const d = device();
    await d.service().create();
    d.usePrf(otherPrf);
    const err = await d.service().unlock().catch((e) => e);
    expect(err.code).toBe("ACCOUNT_MISMATCH");
    expect(d.storage.m.has(SOT.account.sessionStorageKey)).toBe(false);
    expect(await d.service().restore()).toBeNull();
  });

  test("unlock after expiry seals a fresh session", async () => {
    const d = device();
    const a = await d.service().create();
    d.clock.t += TTL_MS + 1;
    expect(await d.service().restore()).toBeNull();
    await d.service().unlock();
    expect((await d.service().restore())?.address).toBe(a.address);
  });
});

// Passkey backup (SOT D27, bagian 12a) di seam AccountService. Kripto Mera asli (createSecretVaultWithNewPasskey,
// decryptSecretVaultWithPasskey, HKDF + AES-GCM); hanya authenticator yang palsu, lewat opsi webAuthnClient Mera.
import { describe, expect, test } from "bun:test";
import * as mera from "@category-labs/mera";
import type { WebAuthnClient } from "@category-labs/mera";
import { SOT } from "@movemarket/shared";
import { createHmac, randomBytes } from "node:crypto";
import { bytesToHex, type Address } from "viem";
import { AccountError } from "../src/contracts/account.ts";
import { createAccountService, type MeraDeps } from "../src/lib/account/mera.ts";
import { deriveEvmPrivateKey } from "../src/lib/account/prf.ts";
import { createVault } from "../src/lib/account/vault.ts";

const RP = "movemarket.test";
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/** Authenticator PRF deterministik: output = HMAC-SHA256(kunci kredensial, salt). Satu perangkat = satu instance. */
function authenticator() {
  const creds = new Map<string, Buffer>();
  const calls = { create: [] as WebAuthnClient.CreateCredentialRequest[], get: [] as WebAuthnClient.GetCredentialRequest[] };
  const prf = (key: Buffer, salt: Uint8Array) => new Uint8Array(createHmac("sha256", key).update(salt).digest());
  const client: WebAuthnClient = {
    async createCredential(req) {
      calls.create.push(req);
      const id = randomBytes(16);
      const key = randomBytes(32);
      creds.set(b64(id), key);
      return { credentialId: id, transports: ["hybrid"], prfEnabled: true, prfOutput: prf(key, req.prfSalt) };
    },
    async getCredential(req) {
      calls.get.push(req);
      const id = req.allowCredential ? b64(req.allowCredential.credentialId) : [...creds.keys()][0];
      const key = id && creds.get(id);
      if (!key) throw new DOMException("no matching credential", "NotAllowedError");
      return { credentialId: Buffer.from(id, "base64url"), prfOutput: prf(key, req.prfSalt) };
    },
  };
  return { client, calls };
}
type Authn = ReturnType<typeof authenticator>;

function memStorage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** Satu perangkat: storage + kunci sesi sendiri. `creator` = authenticator tempat passkey baru dibuat. */
function device(authn: Authn, creator: Authn = authn, onPrf?: (prf: Uint8Array) => void) {
  const storage = memStorage();
  const keys: { key?: CryptoKey } = {};
  const w = { webAuthnClient: authn.client };
  const deps: MeraDeps = {
    rpId: RP,
    storage,
    vault: createVault({ storage, keys: { get: async () => keys.key, put: async (k) => void (keys.key = k), del: async () => void (keys.key = undefined) } }),
    createPasskeyWithPrfOutput: (o) => mera.createPasskeyWithPrfOutput({ ...o, webAuthnClient: creator.client }),
    getPasskeyPrfOutput: async (o) => {
      const r = await mera.getPasskeyPrfOutput({ ...o, ...w });
      onPrf?.(r.prfOutput.slice());
      return r;
    },
    createSecretVaultWithNewPasskey: (o) => mera.createSecretVaultWithNewPasskey({ ...o, webAuthnClient: creator.client }),
    decryptSecretVaultWithPasskey: (o) => mera.decryptSecretVaultWithPasskey({ ...o, ...w }),
  };
  return { svc: createAccountService(deps), storage, keys };
}

/** Laptop dengan passkey utama A membuat akun, lalu menambah backup di HP (authenticator B). */
async function setup() {
  const laptop = authenticator();
  const phone = authenticator();
  let root: Uint8Array | undefined;
  const a = device(laptop, laptop, (p) => (root = p));
  const account = await a.svc.create();
  a.svc.end(); // tanda tangan tidak perlu; createBackupVault hanya butuh penanda + passkey
  const created = device(laptop, phone, (p) => (root = p));
  created.storage.setItem(SOT.account.storageKey, a.storage.getItem(SOT.account.storageKey)!);
  const vaultJson = await created.svc.createBackupVault();
  return { laptop, phone, account, vaultJson, primaryId: a.svc.marker()!.credentialId, root: () => root! };
}
const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof AccountError ? e.code : String(e)));

describe("add backup (createBackupVault)", () => {
  test("re-auths the primary passkey, creates the backup passkey under VITE_RP_ID, vault keyed to the backup credential", async () => {
    const { laptop, phone, vaultJson, primaryId } = await setup();
    // Konfirmasi ulang dibatasi ke passkey utama di penanda.
    expect(b64(laptop.calls.get.at(-1)!.allowCredential!.credentialId)).toBe(primaryId);
    expect(phone.calls.create).toHaveLength(1);
    expect(phone.calls.create[0]!.rp.id).toBe(RP);
    const vault = mera.parseSecretVault(vaultJson);
    expect(b64(new Uint8Array(phone.calls.create[0]!.prfSalt))).toBe(vault.prfSalt);
    expect(vault.credential.transports).toEqual(["hybrid"]);
  });

  test("passkey that derives another address: ACCOUNT_MISMATCH and no backup passkey is created", async () => {
    const laptop = authenticator();
    const phone = authenticator();
    const a = device(laptop);
    await a.svc.create();
    // Penanda menunjuk alamat lain: passkey utama tidak membuka akun itu.
    const d = device(laptop, phone);
    d.storage.setItem(SOT.account.storageKey, JSON.stringify({ ...a.svc.marker(), address: "0x000000000000000000000000000000000000dEaD" }));
    expect(await err(d.svc.createBackupVault())).toBe("ACCOUNT_MISMATCH");
    expect(phone.calls.create).toHaveLength(0);
  });
});

describe("restore on another device (restoreFromVault)", () => {
  test("only the backup passkey: same address, marker caches the vault, next unlock uses vault + backup passkey", async () => {
    const { phone, account, vaultJson } = await setup();
    const p = device(phone);
    const restored = await p.svc.restoreFromVault(account.address, vaultJson);
    expect(restored.address).toBe(account.address);
    const vault = mera.parseSecretVault(vaultJson);
    const m = p.svc.marker()!;
    expect(m).toMatchObject({ rpId: RP, address: account.address, credentialId: vault.credential.credentialId });
    expect(mera.parseSecretVault(m.vault)).toEqual(vault);
    expect(p.svc.hasSession()).toBe(true);

    p.svc.end();
    const getsBefore = phone.calls.get.length;
    expect((await p.svc.unlock()).address).toBe(account.address);
    expect(phone.calls.get.length).toBe(getsBefore + 1);
    expect(b64(phone.calls.get.at(-1)!.allowCredential!.credentialId)).toBe(vault.credential.credentialId);
  });

  test("no plaintext root secret or private key in storage, session key is a non-extractable CryptoKey", async () => {
    const { phone, account, vaultJson, root } = await setup();
    const entropy = root();
    const pk = deriveEvmPrivateKey(entropy.slice());
    const p = device(phone);
    await p.svc.restoreFromVault(account.address, vaultJson);
    const stored = [...p.storage.m.values()].join("\n").toLowerCase();
    for (const secret of [entropy, pk]) {
      expect(stored).not.toContain(bytesToHex(secret).slice(2));
      expect(stored).not.toContain(b64(secret).toLowerCase());
    }
    expect(p.keys.key).toBeInstanceOf(CryptoKey);
    expect(p.keys.key!.extractable).toBe(false);
  });

  test("vault opens a different address than requested: ACCOUNT_MISMATCH, no marker, no session", async () => {
    const { phone, vaultJson } = await setup();
    const p = device(phone);
    const other: Address = "0x000000000000000000000000000000000000dEaD";
    expect(await err(p.svc.restoreFromVault(other, vaultJson))).toBe("ACCOUNT_MISMATCH");
    expect(p.svc.marker()).toBeNull();
    expect(p.svc.hasSession()).toBe(false);
  });

  test("tampered ciphertext: BACKUP_DECRYPT_FAILED; device without the backup passkey: RESTORE_CANCELLED", async () => {
    const { phone, account, vaultJson } = await setup();
    const v = JSON.parse(vaultJson);
    const ct = Buffer.from(v.ciphertext, "base64url");
    ct[0]! ^= 1;
    const tampered = JSON.stringify({ ...v, ciphertext: b64(ct) });
    expect(await err(device(phone).svc.restoreFromVault(account.address, tampered))).toBe("BACKUP_DECRYPT_FAILED");
    expect(await err(device(authenticator()).svc.restoreFromVault(account.address, vaultJson))).toBe("RESTORE_CANCELLED");
  });
});

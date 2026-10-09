import { describe, expect, test } from "bun:test";
import { MeraError } from "@category-labs/mera";
import { SOT } from "@movemarket/shared";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mnemonicToAccount } from "viem/accounts";
import { AccountError } from "../src/contracts/account.ts";
import { createAccountService, type MeraDeps } from "../src/lib/account/mera.ts";
import { accountFromPrf, deriveEvmPrivateKey } from "../src/lib/account/prf.ts";

const HARDHAT = "test test test test test test test test test test test junk";
const HARDHAT_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const prf32 = () => new Uint8Array(32).map((_, i) => i + 1);

describe("derivation (SOT 12)", () => {
  test("well-known mnemonic entropy -> m/44'/60'/0'/0/0 address", () => {
    const { account, session } = accountFromPrf(mnemonicToEntropy(HARDHAT, wordlist));
    expect(account.address).toBe(HARDHAT_ADDR);
    session.end();
  });
  test("32-byte PRF output = 24-word mnemonic path, buffer zeroed", () => {
    const prf = prf32();
    const { account } = accountFromPrf(prf);
    expect(account.address).toBe(mnemonicToAccount(
      "absurd avoid scissors anxiety gather lottery category door army half long cage bachelor another expect people blade school educate curtain scrub monitor lady beyond",
    ).address);
    expect(prf.every((b) => b === 0)).toBe(true);
  });
  test("failed derivation still zeroes the PRF buffer", () => {
    const prf = new Uint8Array(31).fill(7); // bukan panjang entropi BIP-39 yang sah: derivasi melempar
    expect(() => accountFromPrf(prf)).toThrow();
    expect(prf.every((b) => b === 0)).toBe(true);
  });
  test("HD key without private key: explicit error, seed zeroed, HD keys wiped", () => {
    let seed: Uint8Array | undefined;
    const wiped: string[] = [];
    const child = { privateKey: null, wipePrivateData() { wiped.push("child"); return this; } };
    const master = { derive: () => child, wipePrivateData() { wiped.push("master"); return this; } };
    const fromMasterSeed = (s: Uint8Array) => ((seed = s), master) as never;
    expect(() => deriveEvmPrivateKey(prf32(), fromMasterSeed)).toThrow(/private key/);
    expect(seed!.length).toBe(64);
    expect(seed!.every((b) => b === 0)).toBe(true);
    expect(wiped.sort()).toEqual(["child", "master"]);
  });
});

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const cancelled = () => Promise.reject(new MeraError("PASSKEY_OPERATION_FAILED", "NotAllowedError"));
function deps(o: Partial<MeraDeps> = {}): MeraDeps {
  return {
    rpId: "localhost",
    storage: memStorage(),
    createPasskeyWithPrfOutput: async () => ({ credentialId: "cred1", prfSalt: new Uint8Array(32), prfOutput: prf32() }),
    getPasskeyPrfOutput: async () => ({ credentialId: "cred1", prfOutput: prf32() }),
    ...o,
  };
}

describe("AccountService", () => {
  test("create stores only the marker", async () => {
    const d = deps();
    const acc = await createAccountService(d).create();
    expect(JSON.parse(d.storage.getItem(SOT.account.storageKey)!)).toEqual({ rpId: "localhost", address: acc.address, credentialId: "cred1" });
  });
  test("unlock with matching marker returns same address", async () => {
    const d = deps();
    const svc = createAccountService(d);
    const a = await svc.create();
    expect((await svc.unlock()).address).toBe(a.address);
  });
  test("unlock deriving a different address -> ACCOUNT_MISMATCH", async () => {
    const d = deps();
    const svc = createAccountService(d);
    await svc.create();
    d.getPasskeyPrfOutput = async () => ({ credentialId: "cred1", prfOutput: new Uint8Array(32).fill(9) });
    expect(await svc.unlock().catch((e) => e)).toEqual(new AccountError("ACCOUNT_MISMATCH"));
  });
  test("cancel on create -> PASSKEY_CANCELLED, on unlock -> UNLOCK_CANCELLED", async () => {
    const svc = createAccountService(deps({ createPasskeyWithPrfOutput: cancelled, getPasskeyPrfOutput: cancelled }));
    expect((await svc.create().catch((e) => e)).code).toBe("PASSKEY_CANCELLED");
    expect((await svc.unlock().catch((e) => e)).code).toBe("UNLOCK_CANCELLED");
  });
  test("PRF_UNAVAILABLE passes through", async () => {
    const svc = createAccountService(deps({ createPasskeyWithPrfOutput: () => Promise.reject(new MeraError("PRF_UNAVAILABLE", "x")) }));
    expect((await svc.create().catch((e) => e)).code).toBe("PRF_UNAVAILABLE");
  });
});

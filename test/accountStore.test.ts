import { expect, test } from "bun:test";
import { SOT } from "@movemarket/shared";

// Store akun membaca marker dari localStorage saat dimuat; Bun tidak punya localStorage, jadi isi dulu.
const mem = new Map<string, string>([[SOT.account.storageKey, JSON.stringify({ rpId: "localhost", address: "0x00000000000000000000000000000000000000a1", credentialId: "c" })]]);
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};
const { useAccountStore } = await import("../src/stores/account.ts");

test("ACCOUNT_MISMATCH -> startOver clears the marker so onboarding can create a new account", () => {
  expect(useAccountStore.getState().status).toBe("locked");
  useAccountStore.getState().markMismatch();
  expect(useAccountStore.getState().mismatch).toBe(true);
  useAccountStore.getState().startOver();
  expect(mem.has(SOT.account.storageKey)).toBe(false);
  expect(useAccountStore.getState()).toMatchObject({ status: "none", address: undefined, mismatch: false });
});

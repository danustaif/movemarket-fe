import { expect, test } from "bun:test";
import { SOT } from "@movemarket/shared";

// Marker di localStorage (DOM happy-dom dari preload test/dom/setup.ts).
const marker = { rpId: "localhost", address: "0x00000000000000000000000000000000000000a1", credentialId: "c" };
localStorage.setItem(SOT.account.storageKey, JSON.stringify(marker));
const { useAccountStore } = await import("../src/stores/account.ts");

test("ACCOUNT_MISMATCH -> startOver clears the marker so onboarding can create a new account", () => {
  // Store bisa sudah dimuat file test lain (satu proses bun test); lock() membaca ulang marker.
  useAccountStore.getState().lock();
  expect(useAccountStore.getState().status).toBe("locked");
  useAccountStore.getState().markMismatch();
  expect(useAccountStore.getState().mismatch).toBe(true);
  useAccountStore.getState().startOver();
  expect(localStorage.getItem(SOT.account.storageKey)).toBeNull();
  expect(useAccountStore.getState()).toMatchObject({ status: "none", address: undefined, mismatch: false });
});

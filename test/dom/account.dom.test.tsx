import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { SOT } from "@movemarket/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COPY, UI } from "../../src/components/common/copy.ts";
import { AccountError } from "../../src/contracts/account.ts";
import { accountService } from "../../src/lib/account/mera.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { absent, ADDRESS, renderApp, stubBoundaries } from "./helpers.tsx";

const KEY = SOT.account.storageKey;

let unlock: ReturnType<typeof spyOn<typeof accountService, "unlock">>;
beforeEach(() => {
  stubBoundaries();
  // Perangkat punya marker akun (terkunci); passkey yang dipilih menurunkan alamat lain.
  localStorage.setItem(KEY, JSON.stringify({ rpId: "localhost", address: ADDRESS, credentialId: "c" }));
  useAccountStore.getState().lock();
  unlock = spyOn(accountService, "unlock").mockRejectedValue(new AccountError("ACCOUNT_MISMATCH"));
});
afterEach(() => mock.restore());

async function unlockFromHeader() {
  const user = userEvent.setup();
  const r = renderApp("/");
  await user.click(await screen.findByRole("button", { name: COPY.actions.unlock }));
  const toast = await screen.findByRole("alert");
  return { ...r, user, toast };
}

describe("ACCOUNT_MISMATCH", () => {
  test("unlock mismatch shows the error toast offering Create account", async () => {
    const { toast } = await unlockFromHeader();
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(toast.textContent).toContain(COPY.errors.ACCOUNT_MISMATCH);
    expect(within(toast).getByRole("button", { name: COPY.actions.createAccount })).toBeTruthy();
    expect(useAccountStore.getState()).toMatchObject({ status: "locked", mismatch: true });
  });

  test("Create account clears the marker and opens the create flow on /onboarding", async () => {
    const { toast, user, router } = await unlockFromHeader();
    await user.click(within(toast).getByRole("button", { name: COPY.actions.createAccount }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(useAccountStore.getState()).toMatchObject({ status: "none", address: undefined, mismatch: false });
    expect(await screen.findByRole("heading", { name: UI.onboarding.title })).toBeTruthy();
    // Alur create: tombol utama Create account (bukan Unlock) dan tidak ada error mismatch tersisa.
    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: COPY.actions.createAccount })).toBeTruthy();
    absent(within(main).queryByRole("button", { name: COPY.actions.unlock }));
    absent(within(main).queryByText(COPY.errors.ACCOUNT_MISMATCH));
    // Toast yang aksinya sudah dijalankan tidak boleh tetap menawarkan aksi yang sama.
    absent(screen.queryByText(COPY.errors.ACCOUNT_MISMATCH));
  });

  test("toast action startOver runs the account reset (clearMarker + end session)", async () => {
    const clearMarker = spyOn(accountService, "clearMarker");
    const end = spyOn(accountService, "end");
    const { toast, user } = await unlockFromHeader();
    expect(clearMarker).not.toHaveBeenCalled();
    await user.click(within(toast).getByRole("button", { name: COPY.actions.createAccount }));
    expect(clearMarker).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalled();
  });

  test("on /onboarding: mismatch shows the error, Create account clears the marker and starts creation", async () => {
    const create = spyOn(accountService, "create").mockRejectedValue(new AccountError("PASSKEY_CANCELLED"));
    const user = userEvent.setup();
    renderApp("/onboarding");
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: COPY.actions.unlock }));
    await within(main).findByText(COPY.errors.ACCOUNT_MISMATCH);
    await user.click(within(main).getByRole("button", { name: COPY.actions.createAccount }));
    expect(localStorage.getItem(KEY)).toBeNull();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(await within(main).findByText(COPY.errors.PASSKEY_CANCELLED)).toBeTruthy();
  });
});

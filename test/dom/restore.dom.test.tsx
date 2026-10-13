// Pemulihan dengan passkey backup (SOT D27, bagian 12a): /onboarding -> /restore, alamat, pilih vault, akun terbuka.
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { vaultId, type BackupVaultDto } from "@movemarket/shared";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { privateKeyToAccount } from "viem/accounts";
import { COPY, UI } from "../../src/components/common/copy.ts";
import { AccountError } from "../../src/contracts/account.ts";
import { accountService } from "../../src/lib/account/mera.ts";
import { resolver } from "../../src/lib/resolver.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { renderApp, stubBoundaries } from "./helpers.tsx";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const VAULT = JSON.stringify({ version: 1, credential: { credentialId: "AAAA", transports: ["usb"] }, prfSalt: "s", nonce: "n", ciphertext: "c" });
const rec: BackupVaultDto = { id: vaultId(VAULT), vault: VAULT, createdAt: 1_790_000_000 };

let vaults: ReturnType<typeof spyOn<typeof resolver, "vaults">>;
let restore: ReturnType<typeof spyOn<typeof accountService, "restoreFromVault">>;
beforeEach(() => {
  stubBoundaries();
  vaults = spyOn(resolver, "vaults").mockResolvedValue([rec]);
  restore = spyOn(accountService, "restoreFromVault").mockResolvedValue(account);
});
afterEach(() => mock.restore());

describe("restore with a backup passkey", () => {
  test("onboarding without an account links to /restore", async () => {
    const { router } = renderApp("/onboarding");
    await userEvent.setup().click(await screen.findByRole("link", { name: COPY.actions.restoreBackup }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/restore"));
    expect(await screen.findByRole("heading", { name: UI.restore.title })).toBeTruthy();
  });

  test("restore link /restore/<address>: choose the backup, account unlocks with the same address", async () => {
    renderApp(`/restore/${account.address}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `${UI.restore.use}: ${UI.backup.kinds.usb}` }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(account.address, VAULT));
    expect(await screen.findByText(UI.restore.done)).toBeTruthy();
    expect(useAccountStore.getState()).toMatchObject({ status: "unlocked", address: account.address });
    expect(vaults).toHaveBeenCalledWith(account.address);
  });

  test("typed address: invalid -> ADDRESS_INVALID; no vaults -> BACKUP_NOT_FOUND", async () => {
    vaults.mockResolvedValue([]);
    renderApp("/restore");
    const user = userEvent.setup();
    const input = await screen.findByLabelText(UI.restore.addressLabel);
    await user.type(input, "0x123");
    await user.click(screen.getByRole("button", { name: UI.restore.find }));
    expect(await screen.findByText(COPY.errors.ADDRESS_INVALID)).toBeTruthy();
    expect(vaults).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, account.address);
    await user.click(screen.getByRole("button", { name: UI.restore.find }));
    expect(await screen.findByText(COPY.errors.BACKUP_NOT_FOUND)).toBeTruthy();
  });

  test("backup opens another account: ACCOUNT_MISMATCH shown, still no account", async () => {
    restore.mockRejectedValue(new AccountError("ACCOUNT_MISMATCH"));
    renderApp(`/restore/${account.address}`);
    await userEvent.setup().click(await screen.findByRole("button", { name: `${UI.restore.use}: ${UI.backup.kinds.usb}` }));
    expect(await screen.findByText(COPY.errors.ACCOUNT_MISMATCH)).toBeTruthy();
    expect(useAccountStore.getState().status).toBe("none");
  });
});

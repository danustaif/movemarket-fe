// /me bagian passkey backup (SOT D27, bagian 12a): tambah, daftar, hapus. Mera dan resolver dimock di batas modul.
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { SOT, backupMessage, vaultId, type BackupAddBody, type BackupVaultDto } from "@movemarket/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { verifyMessage, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { COPY, UI, fill } from "../../src/components/common/copy.ts";
import { qk } from "../../src/contracts/data.ts";
import { accountService } from "../../src/lib/account/mera.ts";
import { resolver, ResolverError } from "../../src/lib/resolver.ts";
import { useAccountStore } from "../../src/stores/account.ts";
import { renderApp, stubBoundaries } from "./helpers.tsx";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const VAULT = JSON.stringify({ version: 1, credential: { credentialId: "AAAA", transports: ["hybrid"] }, prfSalt: "s", nonce: "n", ciphertext: "c" });
const rec = (o: Partial<BackupVaultDto> = {}): BackupVaultDto => ({ id: vaultId(VAULT), vault: VAULT, createdAt: 1_790_000_000, ...o });
const dateOf = (sec: number) => new Date(sec * 1000).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });

let vaults: ReturnType<typeof spyOn<typeof resolver, "vaults">>;
let create: ReturnType<typeof spyOn<typeof accountService, "createBackupVault">>;
let add: ReturnType<typeof spyOn<typeof resolver, "addVault">>;

beforeEach(() => {
  stubBoundaries();
  useAccountStore.getState().setUnlocked(account);
  vaults = spyOn(resolver, "vaults").mockResolvedValue([]);
  create = spyOn(accountService, "createBackupVault").mockResolvedValue(VAULT);
  add = spyOn(resolver, "addVault").mockImplementation(async (b) => rec({ vault: b.vault }));
});
afterEach(() => mock.restore());

async function panel() {
  renderApp("/me");
  return within((await screen.findByRole("heading", { name: UI.backup.title })).closest("section")!);
}

describe("/me backup passkeys", () => {
  test("Add a backup passkey: Mera vault, then POST /vault signed by the account (EIP-191 over the canonical message)", async () => {
    const p = await panel();
    expect(await p.findByText(UI.backup.none)).toBeTruthy();
    await userEvent.setup().click(p.getByRole("button", { name: COPY.actions.addBackup }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
    const body = add.mock.calls[0]![0] as BackupAddBody;
    expect(body).toMatchObject({ address: account.address, vault: VAULT });
    expect(Math.abs(body.timestamp - Date.now() / 1000)).toBeLessThan(5);
    const message = backupMessage({ action: "add", address: account.address, vaultId: vaultId(VAULT), timestamp: body.timestamp });
    expect(await verifyMessage({ address: account.address, message, signature: body.signature })).toBe(true);
    expect(await p.findByText(UI.backup.saved)).toBeTruthy();
  });

  test("lists backups with device kind and date; Remove sends a signed DELETE", async () => {
    vaults.mockResolvedValue([rec()]);
    const remove = spyOn(resolver, "removeVault").mockResolvedValue({ ok: true });
    const p = await panel();
    const kind = UI.backup.kinds.hybrid;
    expect(await p.findByText(kind)).toBeTruthy();
    expect(p.getByText(fill(UI.backup.added, { date: dateOf(1_790_000_000) }))).toBeTruthy();
    await userEvent.setup().click(p.getByRole("button", { name: `${COPY.actions.removeBackup} ${kind}` }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    const [address, id, body] = remove.mock.calls[0]!;
    expect([address, id]).toEqual([account.address, vaultId(VAULT)]);
    const message = backupMessage({ action: "remove", address: account.address, vaultId: id as Hex, timestamp: body.timestamp });
    expect(await verifyMessage({ address: account.address, message, signature: body.signature })).toBe(true);
  });

  test("at maxPerAddress the add button is disabled and no passkey prompt can start", async () => {
    vaults.mockResolvedValue(Array.from({ length: SOT.account.backup.maxPerAddress }, (_, i) => rec({ id: `0x${String(i).padStart(64, "0")}` })));
    const p = await panel();
    await waitFor(() => expect(p.getByRole<HTMLButtonElement>("button", { name: COPY.actions.addBackup }).disabled).toBe(true));
    expect(p.getByText(fill(UI.backup.limit, { n: SOT.account.backup.maxPerAddress }), { exact: false })).toBeTruthy();
  });

  test("save failure keeps the created vault: Try again re-sends it without a second passkey", async () => {
    add.mockRejectedValueOnce(new ResolverError(500, "boom"));
    const p = await panel();
    const user = userEvent.setup();
    await user.click(await p.findByRole("button", { name: COPY.actions.addBackup }));
    expect(await p.findByText(COPY.errors.BACKUP_SAVE_FAILED)).toBeTruthy();
    await user.click(p.getByRole("button", { name: COPY.actions.addBackup }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledTimes(1);
    expect((add.mock.calls[1]![0] as BackupAddBody).vault).toBe(VAULT);
    expect(await p.findByText(UI.backup.saved)).toBeTruthy();
  });

  test("resolver codes reach the UI (BACKUP_RATE_LIMIT)", async () => {
    add.mockRejectedValue(new ResolverError(429, "x", "BACKUP_RATE_LIMIT"));
    const p = await panel();
    await userEvent.setup().click(await p.findByRole("button", { name: COPY.actions.addBackup }));
    expect(await p.findByText(COPY.errors.BACKUP_RATE_LIMIT)).toBeTruthy();
  });

  test("backup list is cached under qk.backups(address)", async () => {
    const r = renderApp("/me");
    await screen.findByRole("heading", { name: UI.backup.title });
    await waitFor(() => expect(r.queryClient.getQueryData<BackupVaultDto[]>(qk.backups(account.address))).toEqual([]));
  });
});

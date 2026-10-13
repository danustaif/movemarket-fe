// Store akun saat app dimuat dengan sesi tersimpan (D26): restoring -> unlocked tanpa prompt, atau -> locked.
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import { accountService } from "../src/lib/account/mera.ts";
import { useAccountStore } from "../src/stores/account.ts";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const marker = { rpId: "localhost", address: account.address, credentialId: "c" };
afterEach(() => mock.restore());

function withSession(restored: Promise<typeof account | null>) {
  spyOn(accountService, "marker").mockReturnValue(marker);
  spyOn(accountService, "hasSession").mockReturnValue(true);
  return spyOn(accountService, "restore").mockReturnValue(restored);
}

test("stored session: restoring (address known) then unlocked without a passkey prompt", async () => {
  const unlock = spyOn(accountService, "unlock");
  withSession(Promise.resolve(account));
  const done = useAccountStore.getState().restore();
  expect(useAccountStore.getState()).toMatchObject({ status: "restoring", address: account.address });
  await done;
  expect(useAccountStore.getState()).toMatchObject({ status: "unlocked", account });
  expect(unlock).not.toHaveBeenCalled();
});

test("restore failure falls back to locked", async () => {
  withSession(Promise.resolve(null));
  await useAccountStore.getState().restore();
  expect(useAccountStore.getState()).toMatchObject({ status: "locked", account: undefined, address: account.address });
});

test("lock during restoring wins over a late restore result", async () => {
  let finish!: (a: typeof account) => void;
  withSession(new Promise((r) => (finish = r)));
  const done = useAccountStore.getState().restore();
  spyOn(accountService, "hasSession").mockReturnValue(false);
  useAccountStore.getState().lock();
  finish(account);
  await done;
  expect(useAccountStore.getState().status).toBe("locked");
});

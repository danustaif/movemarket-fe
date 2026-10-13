// Turunan kunci dari output PRF (Mera + @scure + noble). Dimuat lazy oleh mera.ts saat create/unlock,
// supaya beranda tidak memuat kriptografi akun.
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { SOT } from "@movemarket/shared";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { nonceManager, type LocalAccount } from "viem";

export { createPasskeyWithPrfOutput, getPasskeyPrfOutput };

type MasterFromSeed = (seed: Uint8Array) => Pick<HDKey, "derive" | "wipePrivateData">;

/**
 * PRF -> BIP-39 -> seed -> m/44'/60'/0'/0/0. seed dan kunci HD di-zero-kan di semua jalur, termasuk saat melempar;
 * pemanggil zero-kan hasilnya. `fromMasterSeed` hanya diganti di test.
 */
export function deriveEvmPrivateKey(prfOutput: Uint8Array, fromMasterSeed: MasterFromSeed = (s) => HDKey.fromMasterSeed(s)): Uint8Array {
  let seed: Uint8Array | undefined;
  let master: ReturnType<MasterFromSeed> | undefined;
  let child: HDKey | undefined;
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    master = fromMasterSeed(seed);
    child = master.derive(SOT.account.derivationPath);
    if (!child.privateKey) throw new Error("HD derivation returned no private key");
    return child.privateKey.slice();
  } finally {
    child?.wipePrivateData();
    master?.wipePrivateData();
    seed?.fill(0);
  }
}

type Account = { session: Secp256k1SigningSession; account: LocalAccount };

/**
 * Sesi Mera + akun viem dari kunci privat; privateKey di-zero-kan, juga saat gagal. `keep` (vault.seal) dipanggil
 * sebelum zero dan wajib menyalin byte secara sinkron.
 */
export function accountFromPrivateKey(privateKey: Uint8Array, keep?: (privateKey: Uint8Array, address: LocalAccount["address"]) => void): Account {
  try {
    const session = createSecp256k1SigningSession({ privateKey });
    const account = toViemAccount(session, { nonceManager });
    keep?.(privateKey, account.address);
    return { session, account };
  } finally {
    privateKey.fill(0);
  }
}

/** Sesi Mera + akun viem dari output PRF. prfOutput dan privateKey di-zero-kan, juga saat gagal. */
export function accountFromPrf(prfOutput: Uint8Array, keep?: Parameters<typeof accountFromPrivateKey>[1]): Account {
  try {
    return accountFromPrivateKey(deriveEvmPrivateKey(prfOutput), keep);
  } finally {
    prfOutput.fill(0);
  }
}

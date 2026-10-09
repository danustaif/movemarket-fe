// Error ke pesan UI (FRONTEND.md bagian 9). Teks dari COPY.errors.
import { isMeraError } from "@category-labs/mera";
import { COPY, type Copy } from "@movemarket/shared";
import { ContractFunctionRevertedError, InsufficientFundsError } from "viem";
import { AccountError, type ContractErrorMessage } from "../contracts/account.ts";
import { ResolverError } from "./resolver.ts";

export type ErrorCode = keyof Copy["errors"];

/** Error aplikasi dengan key COPY.errors (contoh INSUFFICIENT_USDC sebelum mengirim tx). */
export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

const isCode = (k: unknown): k is ErrorCode => typeof k === "string" && Object.hasOwn(COPY.errors, k);

/** Kode COPY.errors dari error apa pun di rantai `cause`, atau null. */
export function errorCode(err: unknown): ErrorCode | null {
  for (let e = err, depth = 0; e instanceof Error && depth < 10; e = e.cause, depth++) {
    if (e instanceof ContractFunctionRevertedError) return isCode(e.data?.errorName) ? e.data.errorName : null;
    if (e instanceof InsufficientFundsError) return "INSUFFICIENT_GAS";
    if (e instanceof AccountError || e instanceof AppError || e instanceof ResolverError) return e.code ?? null;
    if (isMeraError(e) && isCode(e.code)) return e.code;
  }
  return null;
}

export const errorMessage: ContractErrorMessage = (err) => {
  const code = errorCode(err);
  return code ? COPY.errors[code] : null;
};

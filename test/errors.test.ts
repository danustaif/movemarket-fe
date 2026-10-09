import { describe, expect, test } from "bun:test";
import { COPY, liveMarketAbi } from "@movemarket/shared";
import { MeraError } from "@category-labs/mera";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult, InsufficientFundsError } from "viem";
import { AccountError } from "../src/contracts/account.ts";
import { AppError, errorMessage } from "../src/lib/errors.ts";
import { ResolverError } from "../src/lib/resolver.ts";

const revert = (errorName: "BettingClosed" | "StakeCapExceeded" | "FeeTooHigh", args: readonly unknown[] = []) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: liveMarketAbi,
      functionName: "bet",
      data: encodeErrorResult({ abi: liveMarketAbi, errorName, args } as never),
    }),
    { abi: liveMarketAbi, functionName: "bet", args: [1n, true, 1n] },
  );

describe("errorMessage", () => {
  test("custom error name -> COPY.errors[name]", () => {
    expect(errorMessage(revert("BettingClosed", [1n]))).toBe("This market is locked.");
    expect(errorMessage(revert("StakeCapExceeded"))).toBe("Maximum 100 tUSDC per market.");
  });
  test("custom error without copy -> null", () => {
    expect(errorMessage(revert("FeeTooHigh"))).toBeNull();
  });
  test("insufficient native funds -> INSUFFICIENT_GAS", () => {
    expect(errorMessage(new InsufficientFundsError())).toBe(COPY.errors.INSUFFICIENT_GAS);
  });
  test("AccountError, AppError and ResolverError codes", () => {
    expect(errorMessage(new AccountError("ACCOUNT_MISMATCH"))).toBe("This passkey belongs to a different account.");
    expect(errorMessage(new AppError("INSUFFICIENT_USDC"))).toBe("Not enough tUSDC.");
    expect(errorMessage(new ResolverError(500, "x", "FAUCET_FAILED"))).toBe(COPY.errors.FAUCET_FAILED);
  });
  test("MeraError SESSION_ENDED inside a viem error", () => {
    expect(errorMessage(new MeraError("SESSION_ENDED", "ended"))).toBe(COPY.errors.SESSION_ENDED);
  });
  test("unknown -> null", () => {
    expect(errorMessage(new Error("boom"))).toBeNull();
    expect(errorMessage("x")).toBeNull();
  });
});

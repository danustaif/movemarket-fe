import { describe, expect, test } from "bun:test";
import { GAS_LIMITS, SOT } from "@movemarket/shared";
import { InsufficientFundsError, MethodNotFoundRpcError, maxUint256, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { callGas, createTxSender, gasFor, type Clock, type TxSenderDeps } from "../src/lib/account/session.ts";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const addresses = { liveMarket: "0x00000000000000000000000000000000000000a1", mockUsdc: "0x00000000000000000000000000000000000000b2" } as const;

function fakeClock(): Clock & { t: number } {
  const c = { t: 0, now: () => c.t, sleep: async (ms: number) => void (c.t += ms) };
  return c;
}

type Sent = { functionName: string; args: readonly unknown[]; gas: bigint; address: string; at: number };

function harness(o: { syncUnsupported?: boolean; block?: () => bigint; failFirstWith?: Error; failAlwaysWith?: Error } = {}) {
  const clock = fakeClock();
  const sent: Sent[] = [];
  let failNext = o.failFirstWith;
  const receipt = { status: "success", blockNumber: 1n } as TransactionReceipt;
  const record = (p: { functionName: string; args: readonly unknown[]; gas: bigint; address: string }) => {
    if (o.failAlwaysWith) throw o.failAlwaysWith;
    if (failNext) { const e = failNext; failNext = undefined; throw e; }
    sent.push({ functionName: p.functionName, args: p.args, gas: p.gas, address: p.address, at: clock.t });
    clock.t += 400; // inklusi blok
  };
  const topups: string[] = [];
  const notices: number[] = [];
  const deps = {
    onRefill: () => notices.push(topups.length),
    account,
    addresses,
    clock,
    publicClient: {
      simulateContract: async () => ({ request: {} }),
      getBlockNumber: async () => (o.block ? o.block() : 100n),
      waitForTransactionReceipt: async () => receipt,
    },
    walletClient: {
      writeContractSync: async (p: never) => {
        if (o.syncUnsupported) throw new MethodNotFoundRpcError(new Error("eth_sendRawTransactionSync"));
        record(p);
        return receipt;
      },
      writeContract: async (p: never) => { record(p); return "0xhash"; },
    },
    faucetGas: async (a: string) => { topups.push(a); return { monTx: "0xmon" }; },
  } as unknown as TxSenderDeps;
  return { sender: createTxSender(deps), sent, clock, topups, notices };
}

describe("gasFor", () => {
  test("explicit SOT limit", () => expect(gasFor("bet")).toBe(BigInt(GAS_LIMITS.bet!)));
  test("null limit throws", () => expect(() => gasFor("mint")).toThrow(/gas limit/));
});

describe("callGas", () => {
  const limits = { ...GAS_LIMITS, claimManyBase: 50_000, claimManyPerMarket: 40_000 };
  test("claimMany: base + perMarket x n", () =>
    expect(callGas("claimMany", [[1n, 2n, 3n]], limits)).toBe(170_000n));
  test("single-call functions use their own limit", () =>
    expect(callGas("claim", [1n], limits)).toBe(BigInt(GAS_LIMITS.claim!)));
  test("claimMany throws while SOT limits are null", () =>
    expect(() => callGas("claimMany", [[1n]], { ...GAS_LIMITS, claimManyBase: null, claimManyPerMarket: null })).toThrow(/gas limit/));
});

describe("TxSender", () => {
  test("bet uses LiveMarket address, args, and SOT gas", async () => {
    const h = harness();
    await h.sender.liveMarket("bet", [7n, true, 1_000_000n]);
    expect(h.sent[0]).toMatchObject({ functionName: "bet", args: [7n, true, 1_000_000n], gas: BigInt(GAS_LIMITS.bet!), address: addresses.liveMarket });
  });

  test("approveMax approves LiveMarket for maxUint256 on MockUSDC", async () => {
    const h = harness();
    await h.sender.approveMax();
    expect(h.sent[0]).toMatchObject({ functionName: "approve", args: [addresses.liveMarket, maxUint256], address: addresses.mockUsdc, gas: BigInt(GAS_LIMITS.approve!) });
  });

  test("queue keeps minTxGapMs between included transactions and reports busy", async () => {
    const h = harness();
    const a = h.sender.liveMarket("claim", [1n]);
    const b = h.sender.liveMarket("claim", [2n]);
    expect(h.sender.busy()).toBe(true);
    await Promise.all([a, b]);
    expect(h.sender.busy()).toBe(false);
    expect(h.sent[1]!.at - (h.sent[0]!.at + 400)).toBeGreaterThanOrEqual(SOT.frontend.minTxGapMs);
  });

  test("after markFunded, first tx waits postFundingWaitBlocks blocks", async () => {
    let block = 100n;
    const h = harness({ block: () => block++ });
    h.sender.markFunded(100n);
    await h.sender.liveMarket("refund", [3n]);
    expect(block).toBeGreaterThanOrEqual(100n + BigInt(SOT.frontend.postFundingWaitBlocks));
  });

  test("falls back to writeContract + receipt when sync send is unsupported", async () => {
    const h = harness({ syncUnsupported: true });
    const r = await h.sender.liveMarket("claim", [1n]);
    expect(r.status).toBe("success");
    expect(h.sent).toHaveLength(1);
  });

  test("insufficient gas funds: refill from faucet once, then retry", async () => {
    const h = harness({ failFirstWith: new InsufficientFundsError() });
    await h.sender.liveMarket("claim", [1n]);
    expect(h.topups).toEqual([account.address]);
    expect(h.sent).toHaveLength(1);
  });

  test("refill notice fires once, before the faucet call", async () => {
    const h = harness({ failFirstWith: new InsufficientFundsError() });
    await h.sender.liveMarket("claim", [1n]);
    expect(h.notices).toEqual([0]);
  });

  test("still out of gas after the refill: faucet called exactly once, error surfaces", async () => {
    const h = harness({ failAlwaysWith: new InsufficientFundsError() });
    expect(await h.sender.liveMarket("claim", [1n]).catch((e) => e)).toBeInstanceOf(InsufficientFundsError);
    expect(h.topups).toHaveLength(1);
    expect(h.notices).toHaveLength(1);
  });
});

import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useAllowance, useBalance, usePayouts, usePositions } from "../src/queries/index.ts";

// Regresi: tanpa akun (address undefined) hook dulu melempar TypeError dari qk.*(undefined).toLowerCase()
// saat membangun key, sehingga Layout crash sebelum `enabled: false` berlaku.
function NoAccount() {
  usePositions(undefined);
  useBalance(undefined);
  useAllowance(undefined);
  usePayouts(undefined, [1n, 2n]);
  return null;
}

describe("query hooks without account", () => {
  test("render without throwing and stay idle", () => {
    const client = new QueryClient();
    expect(() => renderToString(createElement(QueryClientProvider, { client }, createElement(NoAccount)))).not.toThrow();
    expect(client.getQueryCache().getAll().every((q) => q.state.fetchStatus === "idle")).toBe(true);
  });
});

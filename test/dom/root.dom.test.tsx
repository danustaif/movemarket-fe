import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import { COPY, UI } from "../../src/components/common/copy.ts";
import { ResolverError } from "../../src/lib/resolver.ts";
import { useSseStore } from "../../src/stores/sse.ts";
import { renderApp, stubBoundaries } from "./helpers.tsx";

let b: ReturnType<typeof stubBoundaries>;
beforeEach(() => { b = stubBoundaries(); });
afterEach(() => mock.restore());

describe("root layout", () => {
  test("testnet badge is always visible", async () => {
    renderApp("/");
    expect(await screen.findByText(COPY.brand.testnetBadge)).toBeTruthy();
    expect(await screen.findByText(COPY.home.noGames)).toBeTruthy();
  });

  test("SSE reconnecting shows the reconnect banner, cleared when open", async () => {
    renderApp("/");
    await screen.findByText(COPY.home.noGames);
    expect(screen.queryByText(COPY.errors.SSE_RECONNECTING)).toBeNull();
    act(() => useSseStore.setState({ status: "reconnecting" }));
    expect(screen.getByRole("status").textContent).toContain(COPY.errors.SSE_RECONNECTING);
    act(() => useSseStore.setState({ status: "open" }));
    expect(screen.queryByText(COPY.errors.SSE_RECONNECTING)).toBeNull();
  });

  test("resolver offline on / shows RESOLVER_OFFLINE banner and error box, no crash", async () => {
    b.games.mockRejectedValue(new ResolverError(0, "fetch failed", "RESOLVER_OFFLINE"));
    renderApp("/");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(COPY.errors.RESOLVER_OFFLINE);
    expect(screen.getByRole("status").textContent).toContain(COPY.errors.RESOLVER_OFFLINE);
    expect(screen.getByRole("heading", { name: UI.home.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: COPY.actions.retry })).toBeTruthy();
  });

  test("resolver offline wins over the SSE banner", async () => {
    b.games.mockRejectedValue(new ResolverError(0, "fetch failed", "RESOLVER_OFFLINE"));
    useSseStore.setState({ status: "reconnecting" });
    renderApp("/");
    await screen.findByRole("alert");
    expect(screen.queryByText(COPY.errors.SSE_RECONNECTING)).toBeNull();
  });
});

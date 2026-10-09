// Provider data untuk main.tsx / root route: QueryClientProvider + satu koneksi SSE global.
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useAccountStore } from "../stores/account.ts";
import { useSseStore } from "../stores/sse.ts";
import { queryClient } from "./queryClient.ts";
import { createSseBridge } from "./sse.ts";

const resolverUrl = import.meta.env.VITE_RESOLVER_URL ?? "";

const sseBridge = createSseBridge({
  baseUrl: resolverUrl,
  queryClient,
  getAddress: () => useAccountStore.getState().address,
  onStatus: (status) => useSseStore.setState({ status }),
  onReplayStarting: (replayStarting) => useSseStore.setState({ replayStarting }),
});

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => (resolverUrl ? sseBridge.connect() : undefined), []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

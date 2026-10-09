// Chain, publicClient, dan alamat kontrak. Testnet saja (CLAUDE.md aturan 7).
import { SOT } from "@movemarket/shared";
import { createPublicClient, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

if (monadTestnet.id !== SOT.network.chainId) throw new Error("viem monadTestnet id differs from SOT.network.chainId");
if (import.meta.env.VITE_CHAIN_ID && Number(import.meta.env.VITE_CHAIN_ID) !== monadTestnet.id) {
  throw new Error(`VITE_CHAIN_ID must be ${monadTestnet.id} (Monad Testnet only)`);
}

export const chain = monadTestnet;
export const publicClient = createPublicClient({ chain, transport: http(import.meta.env.VITE_RPC_URL || undefined) });

// Kosong sampai kontrak di-deploy (SOT addresses masih null); query yang membaca kontrak dimatikan.
export const LIVE_MARKET = (import.meta.env.VITE_LIVE_MARKET_ADDRESS || undefined) as Address | undefined;
export const MOCK_USDC = (import.meta.env.VITE_MOCK_USDC_ADDRESS || undefined) as Address | undefined;

export function contracts(): { liveMarket: Address; mockUsdc: Address } {
  if (!LIVE_MARKET || !MOCK_USDC) throw new Error("VITE_LIVE_MARKET_ADDRESS / VITE_MOCK_USDC_ADDRESS are not set");
  return { liveMarket: LIVE_MARKET, mockUsdc: MOCK_USDC };
}

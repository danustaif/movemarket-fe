// Preload bun test (bunfig.toml): DOM happy-dom untuk test komponen, sesuai https://bun.com/docs/test/dom.
// Berlaku untuk semua file test; test lama tidak bergantung pada ketiadaan DOM.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register({ url: "http://localhost/" });

// Alamat kontrak palsu (import.meta.env = process.env di Bun), dibaca lib/chain.ts saat dimuat. RPC tetap dimock.
process.env.VITE_LIVE_MARKET_ADDRESS ||= "0x00000000000000000000000000000000000000c1";
process.env.VITE_MOCK_USDC_ADDRESS ||= "0x00000000000000000000000000000000000000c2";

// Tidak ada request nyata dari test: resolver, Envio, dan RPC viem harus dimock di batas modul.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`network disabled in tests: ${String(input instanceof Request ? input.url : input)}`);
}) as unknown as typeof fetch;

// Import setelah register: screen dari testing-library mengikat document.body saat dimuat.
const { cleanup } = await import("@testing-library/react");
afterEach(() => {
  cleanup();
  localStorage.clear();
});

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_RESOLVER_URL: string;
  readonly VITE_ENVIO_URL: string;
  readonly VITE_LIVE_MARKET_ADDRESS: `0x${string}`;
  readonly VITE_MOCK_USDC_ADDRESS: `0x${string}`;
  readonly VITE_RP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

# movemarket-fe

Frontend MoveMarket: Vite + React + TypeScript + Tailwind, TanStack Router/Query, Zustand, viem + Mera (tanpa wagmi).

Spesifikasi: `../source/docs/FRONTEND.md`, `../source/docs/USER_FLOW.md`, desain `../source/DESIGN.md` dan `../source/design/prototype/`. Clone repo `movemarket-source` di sebelah repo ini; paket `@movemarket/shared` diambil dari `../source/shared`.

## Status

Tahap antarmuka (`src/contracts/`), belum ada UI:

| File | Isi |
|---|---|
| `data.ts` | Model domain bigint, `ResolverClient`, `IndexerClient`, `qk`, `SseBridge`/`SseReducers`, `ChainClock`, `MarketPhase` |
| `account.ts` | `AccountService` (passkey Mera), `AccountState`, `TxSender` (aturan gas dan antrian Monad), error akun |
| `ui.ts` | Route, bentuk data hook query/mutation, props komponen utama |
| `../env.d.ts`, `.env.example` | Variabel `VITE_*` |

Tipe API resolver, SSE, dan ABI datang dari `@movemarket/shared`, jadi perubahan SOT langsung memecah typecheck di sini.

Berikutnya: `bun create vite` (React + TS) di repo ini, lalu implementasi sesuai kontrak.

## Perintah

```bash
bun install
bun run typecheck   # tsc -b, termasuk tsconfig.test.json (src + test)
bun test            # semua test: unit (test/*.test.ts) dan DOM (test/dom/*.dom.test.tsx)
bun test test/dom   # hanya test DOM
bun run build
```

Test DOM memakai happy-dom lewat preload `test/dom/setup.ts` (`bunfig.toml`, sesuai bun.com/docs/test/dom) dan
Testing Library. Preload memblokir `fetch` global; resolver, Envio, RPC baca, dan `TxSender` diganti spy di objek
kliennya (`test/dom/helpers.tsx` `stubBoundaries()`, `spyOn(txSenderFor(account), "liveMarket")`). Untuk elemen yang
tidak boleh ada pakai `absent(el)`, bukan `expect(el).toBeNull()`: kegagalan yang mencetak node happy-dom membuat
Bun menggantung.

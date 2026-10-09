# movemarket-fe

Frontend MoveMarket: Vite + React + TypeScript + Tailwind, TanStack Router/Query, Zustand, viem + Mera (tanpa wagmi).

Spesifikasi: `../source/docs/FRONTEND.md`, `../source/docs/USER_FLOW.md`, desain `../source/DESIGN.md` dan `../source/design/prototype/`. Clone repo `movemarket-source` di sebelah repo ini; paket `@movemarket/shared` diambil dari `../source/shared`.

## Struktur

Kontrak lapisan data di `src/contracts/` (`data.ts`, `account.ts`, `ui.ts`). Route di `src/routes/`: file route berisi loader,
komponen halaman di `-*.page.tsx` dan dimuat lazy. Kriptografi akun (Mera, @scure) ada di `src/lib/account/prf.ts`, dimuat saat
create/unlock. Tipe API resolver, SSE, dan ABI datang dari `@movemarket/shared`, jadi perubahan SOT langsung memecah typecheck di sini.

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

## Deploy (statis)

SPA biasa: `bun run build` menghasilkan `dist/`. Belum ada deploy; file berikut menyiapkan fallback route ke `index.html`
supaya `/game/...`, `/me`, dan seterusnya bisa dibuka langsung.

| Platform | File | Catatan |
|---|---|---|
| Netlify | `public/_redirects` (`/* /index.html 200`, ikut tersalin ke `dist/`) | File yang ada (aset) tetap dilayani lebih dulu. |
| Cloudflare Pages | tidak perlu | Tanpa `404.html` di root, Pages otomatis memperlakukan proyek sebagai SPA. Aturan `_redirects` di atas dideteksi sebagai loop dan diabaikan. |
| Vercel | `vercel.json` (`rewrites` ke `/index.html`) | Berkas statis dilayani sebelum rewrite. |

Build butuh repo `source` di sebelah repo ini (`@movemarket/shared` = `file:../source/shared`, SOT `../source/sot/*.json`).
Platform yang hanya meng-clone `fe/` akan gagal build: build di CI yang meng-clone keduanya lalu unggah `dist/` (prebuilt),
atau atur langkah clone tambahan.

Variabel `VITE_*` wajib diisi saat build (nilainya ditanam ke bundle, bukan dibaca saat runtime). Daftar di `.env.example`
dan `../source/docs/ARCHITECTURE.md` bagian 8:

- `VITE_CHAIN_ID` harus `10143` (Monad Testnet); nilai lain membuat aplikasi melempar error saat dimuat.
- `VITE_RPC_URL`, `VITE_RESOLVER_URL` (HTTPS di produksi), `VITE_ENVIO_URL`, `VITE_LIVE_MARKET_ADDRESS`, `VITE_MOCK_USDC_ADDRESS`.
- `VITE_RP_ID` harus sama persis dengan domain final (mis. `movemarket.example`), bukan `location.hostname`. Passkey terikat
  ke RP ID: setelah ada pengguna, **jangan diganti**, karena akun yang sudah dibuat tidak bisa dibuka lagi di RP ID lain.
  Tentukan domain final sebelum deploy pertama yang dipakai orang.

`server.fs.allow: ['..']` di `vite.config.ts` hanya berlaku untuk dev server (membaca `../source`); build produksi tidak memakainya.


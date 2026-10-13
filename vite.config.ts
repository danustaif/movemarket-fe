import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Vendor besar dipisah per chunk supaya cache browser bertahan antar deploy kode aplikasi.
// Mera/@scure tidak di sini: dimuat lazy lewat lib/account/prf.ts saat create/unlock.
// viem tidak menarik dependensinya (includeDependenciesRecursively: false): @scure/@noble milik prf.ts tetap lazy.
// Grup lain wajib menarik dependensinya; tanpa itu modul bersama (use-sync-external-store) tertinggal di entry,
// chunk saling impor melingkar, dan build produksi gagal saat init ("r is not a function").
const VENDOR: { name: string; test: RegExp; includeDependenciesRecursively?: boolean }[] = [
  { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\// },
  { name: 'tanstack', test: /node_modules\/(@tanstack|use-sync-external-store)\// },
  { name: 'viem', test: /node_modules\/(viem|ox|abitype)\//, includeDependenciesRecursively: false },
  { name: 'chessboard', test: /node_modules\/(react-chessboard|@dnd-kit)\// },
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @movemarket/shared dan sot/*.json berada di ../source (repo berdampingan), di luar root Vite. Hanya dev server.
  server: { fs: { allow: ['..'] } },
  build: {
    // Chunk Board3D (three.js, ~580 kB mentah / ~150 kB gzip) dimuat lazy hanya saat papan 3D tampil.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Hanya modul awal ($initial) yang dikelompokkan, supaya chunk lazy (prf, halaman) tidak ikut tertarik ke awal.
        codeSplitting: { groups: VENDOR.map((g) => ({ ...g, tags: ['$initial'] })) },
      },
    },
  },
})

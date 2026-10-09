import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Vendor besar dipisah per chunk supaya cache browser bertahan antar deploy kode aplikasi.
// Mera/@scure tidak di sini: dimuat lazy lewat lib/account/prf.ts saat create/unlock.
const VENDOR: [name: string, test: RegExp][] = [
  ['react', /node_modules\/(react|react-dom|scheduler)\//],
  ['tanstack', /node_modules\/@tanstack\//],
  ['viem', /node_modules\/(viem|ox|abitype|@noble)\//],
  ['chessboard', /node_modules\/(react-chessboard|@dnd-kit)\//],
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @movemarket/shared dan sot/*.json berada di ../source (repo berdampingan), di luar root Vite. Hanya dev server.
  server: { fs: { allow: ['..'] } },
  build: {
    rolldownOptions: {
      output: {
        // Hanya modul awal ($initial) yang dikelompokkan; dependensi chunk lazy (prf, halaman) tidak ikut tertarik ke awal.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: VENDOR.map(([name, test]) => ({ name, test, tags: ['$initial'] })),
        },
      },
    },
  },
})

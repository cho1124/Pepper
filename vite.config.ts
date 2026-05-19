import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Cargo target / .git / node_modules / dist 는 watch 에서 제외 — FSWatcher UNKNOWN error 방지
      ignored: [
        '**/src-tauri/target/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
      ],
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
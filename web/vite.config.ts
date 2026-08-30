import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Дев-сервер веба ходит в локальный сервер «Копирки» на 43117.
// В проде статика раздаётся тем же сервером, поэтому запросы идут same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:43117',
        changeOrigin: true,
        // Сервер пускает только свой origin (server/src/app.ts). В деве браузер шлёт
        // Origin дев-сервера, и все POST/PATCH отклонялись бы как чужие — подменяем.
        // В проде статику раздаёт тот же сервер, там подмена не нужна.
        headers: { origin: 'http://127.0.0.1:43117' },
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})

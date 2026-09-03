import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Дев-сервер веба ходит в локальный сервер «Копирки» на 43117.
// В проде статика раздаётся тем же сервером, поэтому запросы идут same-origin.
// KOPIRKA_API_TARGET/KOPIRKA_WEB_PORT — для изолированных песочниц (см. sandbox/); без них
// поведение не отличается от значений по умолчанию ниже.
const apiTarget = process.env.KOPIRKA_API_TARGET ?? 'http://127.0.0.1:43117'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.KOPIRKA_WEB_PORT ?? 5173),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // Сервер пускает только свой origin (server/src/app.ts). В деве браузер шлёт
        // Origin дев-сервера, и все POST/PATCH отклонялись бы как чужие — подменяем.
        // В проде статику раздаёт тот же сервер, там подмена не нужна.
        headers: { origin: apiTarget },
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})

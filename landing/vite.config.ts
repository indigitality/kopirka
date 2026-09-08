import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Лендинг «Копирки» — отдельный статический сайт, без сервера и без API.
 *
 * Порт 5180 выбран так, чтобы не пересекаться с уже занятыми в проекте:
 * 5173 — веб приложения, 5174 — его песочница, 6006 — Storybook,
 * 5176/5177 — изолированные прогоны `tests/ui`.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: Number(process.env.KOPIRKA_LANDING_PORT ?? 5180) },
  preview: { port: Number(process.env.KOPIRKA_LANDING_PORT ?? 5180) },
  build: { outDir: 'dist', emptyOutDir: true },
});

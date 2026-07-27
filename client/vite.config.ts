import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Chat is a separate service (services/chat, Go + Postgres) the client talks to
      // directly — not proxied through Spring. Registered before the broader '/api' entry
      // below so it wins the match for this one path prefix.
      '/api/chat': process.env.VITE_CHAT_PROXY_TARGET ?? 'http://localhost:8081',

      // Forward API calls to the Spring Boot backend during development.
      // MSW-1: Playwright's webServer array sets VITE_API_PROXY_TARGET to
      // the standalone e2e mock server's URL for the `e2e`/`visual-regression`
      // projects only (playwright.config.ts) — plain `pnpm dev` outside
      // Playwright always targets the real backend, unaffected.
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
    },
  },
});

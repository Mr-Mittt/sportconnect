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
      // below so it wins the match for this one path prefix. ws: true is required (the
      // string-shorthand form doesn't proxy WebSocket upgrades) — CHAT-7 needs it for
      // GET /api/chat/conversations/{id}/ws. rewrite strips the '/api/chat' prefix before
      // forwarding: the Go service's own router (internal/api/router.go) registers routes
      // as e.g. "POST /conversations/open/group/{groupId}", with no '/api/chat' prefix at
      // all — without this, every proxied request 404s at the Go service (confirmed live,
      // CHAT-8: this bug predates CHAT-8 itself, present since this proxy entry was first
      // added, and was masked because prior "live verification" always hit :8081 directly,
      // never through this actual dev proxy path a real browser uses).
      '/api/chat': {
        target: process.env.VITE_CHAT_PROXY_TARGET ?? 'http://localhost:8081',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/chat/, ''),
      },

      // Forward API calls to the Spring Boot backend during development.
      // MSW-1: Playwright's webServer array sets VITE_API_PROXY_TARGET to
      // the standalone e2e mock server's URL for the `e2e`/`visual-regression`
      // projects only (playwright.config.ts) — plain `pnpm dev` outside
      // Playwright always targets the real backend, unaffected.
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
    },
  },
});

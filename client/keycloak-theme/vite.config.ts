import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { keycloakify } from 'keycloakify/vite-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// AUTH-15 / A24 "shared" route: the theme compiles the client's own tokens and primitives, so a
// design change in the client reaches the Keycloak pages on the next theme build. '@' therefore
// points into client/src. The files the theme may import are listed in src/theme.css (@source) and
// guarded in the client's ESLint config (no app state in them).
const clientSrc = fileURLToPath(new URL('../src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': clientSrc },
    // The shared client files import react, Tabler and the cva/clsx/twMerge helpers: resolve those
    // from this package, never from client/node_modules, or the page would load two React copies.
    dedupe: [
      'react',
      'react-dom',
      '@tabler/icons-react',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
    ],
  },
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  plugins: [
    react(),
    tailwindcss(),
    keycloakify({ themeName: 'sportconnect', accountThemeImplementation: 'none' }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

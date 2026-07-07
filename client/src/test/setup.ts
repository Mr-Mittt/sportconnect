import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals (explicit imports, see vitest.config.ts), so RTL
// can't register its automatic cleanup — do it explicitly or the DOM
// accumulates across tests within a file.
afterEach(() => {
  cleanup();
});

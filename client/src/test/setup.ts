import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals (explicit imports, see vitest.config.ts), so RTL
// can't register its automatic cleanup — do it explicitly or the DOM
// accumulates across tests within a file.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver (GRP-6's useAnchorBottom needs it to
// track an anchor element's size). A no-op stub is enough for component
// tests — none of them assert on resize-driven re-measurement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

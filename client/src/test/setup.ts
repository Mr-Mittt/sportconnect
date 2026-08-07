import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';

// Vitest runs without globals (explicit imports, see vitest.config.ts), so RTL
// can't register its automatic cleanup — do it explicitly or the DOM
// accumulates across tests within a file.
afterEach(() => {
  cleanup();
});

// SPORT-3: sportIdMap.ts's sportIdForKey/sportKeyForId now resolve against this store instead
// of a hardcoded table. Seeded globally (not per-file) with the football/basketball/tennis
// convention nearly every existing component test's own local fixtures already use — those
// fixtures don't need to change (they're testing client behavior, not mirroring the real
// backend's current catalog; SPORT-3's e2e suite is the layer that does that). A test needing a
// different catalog (e.g. one exercising an unresolvable sportId) can call
// useSportCatalogStore.getState().setCatalog(...) itself to override this default.
beforeEach(() => {
  useSportCatalogStore.getState().setCatalog([
    { id: 5, key: 'football', name: 'Football' },
    { id: 6, key: 'basketball', name: 'Basketball' },
    { id: 2, key: 'tennis', name: 'Tennis' },
  ]);
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

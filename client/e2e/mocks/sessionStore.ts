import { SESSION_HEADER } from './mockServerConfig.ts';

export const DEFAULT_SESSION_ID = 'default';

/**
 * Reads the per-test session id a browser context attaches to every request
 * (see test.ts) — falls back to a fixed bucket so a request that somehow
 * arrives without the header (e.g. a manual curl against the running mock
 * server) still gets sane, isolated-from-nothing behavior instead of a 500.
 */
export function sessionIdFromRequest(request: Request): string {
  return request.headers.get(SESSION_HEADER) ?? DEFAULT_SESSION_ID;
}

/**
 * Per-session state container for the standalone mock server (MSW-1). One
 * Node process serves every Playwright test/worker concurrently
 * (`fullyParallel: true`) — without this, a handler's state would be one
 * `let` shared across every test running at the same time, exactly the class
 * of cross-test corruption this ticket exists to eliminate. Each handler
 * file keeps its own store instance (e.g. feed.ts's posts/comments,
 * groups.ts's groups/join-requests) and reads/writes through `get`/`reset`
 * using the request's session id, instead of a module-level `let`.
 */
export function createSessionStore<T>(createDefault: () => T): {
  get(sessionId: string): T;
  reset(sessionId: string): void;
  deleteSession(sessionId: string): void;
} {
  const store = new Map<string, T>();
  return {
    get(sessionId: string): T {
      let value = store.get(sessionId);
      if (value === undefined) {
        value = createDefault();
        store.set(sessionId, value);
      }
      return value;
    },
    reset(sessionId: string): void {
      store.set(sessionId, createDefault());
    },
    deleteSession(sessionId: string): void {
      store.delete(sessionId);
    },
  };
}

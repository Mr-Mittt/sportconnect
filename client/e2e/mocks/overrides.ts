import { createSessionStore } from './sessionStore.ts';

/**
 * MSW-1: replaces the old per-navigation `worker.use()` override pattern
 * (apiErrors.ts, emptyFeed.ts, expireSession.ts, emptySportProfiles.ts,
 * failCreatePostOnce.ts — all retired) with a flat set of per-session
 * boolean flags. The real handlers in handlers/*.ts check their relevant
 * flag first and short-circuit to the simulated response before falling
 * through to normal logic — same effective precedence `worker.use()` gave a
 * runtime-registered handler over the base one, without needing to replicate
 * msw's handler-list-precedence machinery server-side.
 *
 * `createPostFailOnce` is consumed (reset to `false`) the first time
 * feed.ts's create-post handler reads it — the "once" semantics
 * failCreatePostOnce.ts used to get from msw's `{ once: true }` handler
 * option.
 */
export interface SessionOverrides {
  feedError: boolean;
  feedEmpty: boolean;
  trendingError: boolean;
  broadcastsError: boolean;
  groupsError: boolean;
  refreshExpired: boolean;
  sportProfilesEmpty: boolean;
  createPostFailOnce: boolean;
  notificationsEmpty: boolean;
}

function defaultOverrides(): SessionOverrides {
  return {
    feedError: false,
    feedEmpty: false,
    trendingError: false,
    broadcastsError: false,
    groupsError: false,
    refreshExpired: false,
    sportProfilesEmpty: false,
    createPostFailOnce: false,
    notificationsEmpty: false,
  };
}

const overrideSessions = createSessionStore(defaultOverrides);

export function getOverrides(sessionId: string): SessionOverrides {
  return overrideSessions.get(sessionId);
}

/** Admin-route entry point — flips exactly one flag on, by name. */
export function setOverride(sessionId: string, name: keyof SessionOverrides): void {
  overrideSessions.get(sessionId)[name] = true;
}

/**
 * Consumes `createPostFailOnce`: returns whether this call should fail, and
 * clears the flag so only the next create-post call is affected — mirrors
 * msw's old `{ once: true }` handler option.
 */
export function consumeCreatePostFailOnce(sessionId: string): boolean {
  const overrides = overrideSessions.get(sessionId);
  if (!overrides.createPostFailOnce) return false;
  overrides.createPostFailOnce = false;
  return true;
}

export function resetOverrides(sessionId: string): void {
  overrideSessions.reset(sessionId);
}

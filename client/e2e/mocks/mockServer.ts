import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { getResponse } from 'msw';
import { handlers } from './handlers/index.ts';
import { resetChatHandlersState } from './handlers/chat.ts';
import { resetFeedSession, seedPostsState } from './handlers/feed.ts';
import { resetFriendHandlersState } from './handlers/friends.ts';
import { resetGroupHandlersState, seedJoinRequestsState } from './handlers/groups.ts';
import { resetLocationHandlersState } from './handlers/locations.ts';
import { resetSessionHandlersState } from './handlers/sessions.ts';
import { resetSportHandlersState, seedZeroSportProfilesState } from './handlers/sport.ts';
import { mockJoinRequest } from './fixtures.ts';
import { buildPaginatedFeed } from './paginatedFeedFixture.ts';
import { resetOverrides, setOverride, type SessionOverrides } from './overrides.ts';
import { MOCK_SERVER_PORT } from './mockServerConfig.ts';
import { DEFAULT_SESSION_ID, sessionIdFromRequest } from './sessionStore.ts';

/**
 * MSW-1: standalone Node HTTP server replacing MSW's per-navigation browser
 * Service Worker (see client/docs/BACKLOG_MVP.md · MSW-1 for the full
 * investigation this replaces). Started once via Playwright's `webServer`
 * array, already listening before any test runs — there is no per-navigation
 * setup handshake left to race the app's own bootstrap fetch against.
 *
 * Reuses the exact same `handlers` array every browser-mode consumer used
 * (handlers/index.ts) via msw's own `getResponse(handlers, request)` — the
 * same matching/resolution engine `setupWorker`/`setupServer` use internally,
 * just driven directly against a real Node `Request` built from the incoming
 * HTTP request instead of a Service Worker's `fetch` event.
 *
 * Because one process now serves every Playwright test/worker concurrently
 * (`fullyParallel: true`), all stateful handlers (feed.ts, groups.ts,
 * sport.ts) key their data by an `x-e2e-session-id` header the test's
 * browser context attaches to every request (see test.ts) — see
 * sessionStore.ts for why.
 *
 * A real listening server also means `Set-Cookie` response headers are
 * genuinely honored by the browser's own cookie jar (unlike a Service-Worker-
 * synthesized response, or a Playwright `route.fulfill()`-mocked one — see
 * AUTH-8's summary/fixtures.ts's own hard-won note) — this is what makes a
 * real reload-persistence test possible for the first time.
 */

const BASE_URL = `http://localhost:${MOCK_SERVER_PORT}`;

interface RequestLogEntry {
  method: string;
  path: string;
  timestamp: string;
}

const requestLogs = new Map<string, RequestLogEntry[]>();

function logRequest(sessionId: string, method: string, path: string): void {
  const log = requestLogs.get(sessionId) ?? [];
  log.push({ method, path, timestamp: new Date().toISOString() });
  requestLogs.set(sessionId, log);
}

function resetSession(sessionId: string): void {
  resetFeedSession(sessionId);
  resetGroupHandlersState(sessionId);
  resetSportHandlersState(sessionId);
  resetFriendHandlersState(sessionId);
  resetChatHandlersState(sessionId);
  resetLocationHandlersState(sessionId);
  resetSessionHandlersState(sessionId);
  resetOverrides(sessionId);
  requestLogs.delete(sessionId);
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const single of value) headers.append(key, single);
    } else {
      headers.append(key, value);
    }
  }
  const body = await readBody(req);
  return new Request(`${BASE_URL}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    body,
  });
}

/**
 * `Headers.forEach`/iteration combines multiple `Set-Cookie` entries into one
 * comma-joined string, which is invalid for cookies specifically (commas are
 * legal inside a single cookie's `Expires` attribute) — `getSetCookie()` is
 * the dedicated escape hatch for writing them back out as separate headers.
 */
function writeFetchResponse(response: Response, res: ServerResponse, body: Buffer): void {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    headers[key] = value;
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) headers['set-cookie'] = setCookies;
  res.writeHead(response.status, headers);
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

const OVERRIDE_NAMES: ReadonlySet<keyof SessionOverrides> = new Set([
  'feedError',
  'feedEmpty',
  'trendingError',
  'broadcastsError',
  'groupsError',
  'refreshExpired',
  'sportProfilesEmpty',
  'createPostFailOnce',
]);

/**
 * Admin API — everything under `/__mock/*`. Replaces the old
 * `page.addInitScript` + dynamic-import + `worker.use()` mechanism: test-side
 * code (fixtures.ts, specs) now makes a plain HTTP call here via Playwright's
 * `request` fixture instead of injecting browser JS.
 */
async function handleAdminRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  if (pathname === '/__mock/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  const sessionMatch = pathname.match(/^\/__mock\/sessions\/([^/]+)\/(.+)$/);
  if (!sessionMatch) {
    sendJson(res, 404, { error: 'Unknown admin route' });
    return;
  }
  const [, rawSessionId, action] = sessionMatch;
  const sessionId = decodeURIComponent(rawSessionId);

  if (action === 'reset' && req.method === 'POST') {
    resetSession(sessionId);
    sendJson(res, 200, { reset: true });
    return;
  }

  if (action === 'requests' && req.method === 'GET') {
    sendJson(res, 200, requestLogs.get(sessionId) ?? []);
    return;
  }

  if (action === 'seed-paginated-feed' && req.method === 'POST') {
    seedPostsState(sessionId, buildPaginatedFeed());
    sendJson(res, 200, { seeded: true });
    return;
  }

  if (action === 'seed-join-requests' && req.method === 'POST') {
    seedJoinRequestsState(sessionId, [mockJoinRequest]);
    sendJson(res, 200, { seeded: true });
    return;
  }

  const overrideMatch = action.match(/^override\/(.+)$/);
  if (overrideMatch && req.method === 'POST') {
    const name = overrideMatch[1];
    if (!OVERRIDE_NAMES.has(name as keyof SessionOverrides)) {
      sendJson(res, 404, { error: `Unknown override: ${name}` });
      return;
    }
    setOverride(sessionId, name as keyof SessionOverrides);
    // GRP-8 bug fix: `sportProfilesEmpty` also needs the *real* session state
    // cleared, not just the faked GET response — see seedZeroSportProfilesState's
    // own doc comment for why (a POST /sports/profiles right after this used to
    // 400 against the still-full default fixture underneath).
    if (name === 'sportProfilesEmpty') {
      seedZeroSportProfilesState(sessionId);
    }
    sendJson(res, 200, { override: name, applied: true });
    return;
  }

  sendJson(res, 404, { error: 'Unknown admin route' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', BASE_URL);

    if (url.pathname.startsWith('/__mock/')) {
      await handleAdminRoute(req, res, url.pathname);
      return;
    }

    const request = await toFetchRequest(req);
    const sessionId = sessionIdFromRequest(request);
    logRequest(sessionId, request.method, url.pathname);

    const response = await getResponse(handlers, request, { baseUrl: BASE_URL });
    if (!response) {
      sendJson(res, 404, {
        success: false,
        message: `No mock handler for ${request.method} ${url.pathname}`,
        data: null,
      });
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    writeFetchResponse(response, res, body);
  } catch (error) {
    // A crashed handler shouldn't take the whole server down mid-suite —
    // surface it as a 500 so the failing test's assertion points here,
    // rather than every subsequent request hanging against a dead process.
    console.error('[mock-server] request handling error:', error);
    sendJson(res, 500, { success: false, message: 'Mock server error', data: null });
  }
});

server.listen(MOCK_SERVER_PORT, () => {
  console.log(`[mock-server] listening on ${BASE_URL} (default session: ${DEFAULT_SESSION_ID})`);
});

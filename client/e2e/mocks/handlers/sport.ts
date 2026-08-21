import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  SportAttributeSchema,
  SportResponse,
  UserSportProfileResponse,
} from '../../../src/shared/types/sport.ts';
import { mockSportProfiles, mockUser } from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

// SPORT-3: real shape of `SportResponse` — this catalog is now the client's
// actual source of truth for "which sports exist" (`useSportCatalog()`),
// not just a placeholder for a future add-sport flow. Matches the real
// backend's post-A6 state exactly: every seeded sport except Badminton and
// Pickleball is deactivated, so `GET /api/sports` (active-only) returns just
// these 2. Ids match `V003__create_sports_tables.sql`'s INSERT order.
const mockSportCatalog = [
  { id: 1, name: 'Badminton', category: null, iconUrl: '/images/sports/badminton.png', isActive: true },
  { id: 3, name: 'Pickleball', category: null, iconUrl: '/images/sports/pickleball.png', isActive: true },
];

// ADMIN-2: the admin-only `GET /api/sports/all` returns every sport, deactivated ones
// included — the full `SportResponse` shape, not the trimmed rows above. Tennis is
// deliberately inactive: it is what exercises the "A9's GET 404s for an inactive sport, so
// don't fire it" branch the detail panel gates on.
function adminSportRow(
  id: number,
  name: string,
  isActive: boolean,
  overrides: Partial<SportResponse> = {},
): SportResponse {
  return {
    id,
    name,
    description: null,
    category: 'Racket',
    iconUrl: `/images/sports/${name.toLowerCase()}.png`,
    minPlayers: 2,
    maxPlayers: 4,
    isActive,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function defaultAdminSportCatalog(): SportResponse[] {
  return [
    adminSportRow(1, 'Badminton', true),
    adminSportRow(3, 'Pickleball', true),
    adminSportRow(4, 'Tennis', false),
  ];
}

// A9's document shape. Only Badminton starts with one — Pickleball exercises the
// "sport has no schema yet, GET returns data: null" branch.
function defaultAttributeSchemas(): Record<number, SportAttributeSchema | null> {
  return {
    1: {
      version: 1,
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          order: 1,
          attributes: [
            { key: 'racketBrand', label: 'Racket brand', type: 'STRING', isAvailable: true, order: 1 },
          ],
        },
      ],
    },
    3: null,
  };
}

interface SportSession {
  userSportProfilesState: UserSportProfileResponse[];
  nextProfileId: number;
  /** ADMIN-2: stateful so a PUT actually shows up on the next GET, same reasoning as
   * userSportProfilesState below. */
  adminSportCatalogState: SportResponse[];
  attributeSchemaState: Record<number, SportAttributeSchema | null>;
}

// Stateful, same reasoning as groups.ts's userGroupsState — a profile
// created via POST /sports/profiles must actually appear on the next GET
// /sports/profiles/user/:userId, since useAddSportProfile's own optimistic
// cache write would otherwise be clobbered by the mutation's background
// invalidate+refetch if this were a fixed responder.
function defaultSportSession(): SportSession {
  return {
    userSportProfilesState: mockSportProfiles,
    nextProfileId: 100,
    adminSportCatalogState: defaultAdminSportCatalog(),
    attributeSchemaState: defaultAttributeSchemas(),
  };
}

// MSW-1: session-keyed, same reasoning as feed.ts's feedSessions.
const sportSessions = createSessionStore(defaultSportSession);

export const sportHandlers: HttpHandler[] = [
  // Public GET — no auth required (SportController's @Operation(security = {})).
  http.get('/api/sports/profiles/user/:userId', ({ request }) => {
    const sessionId = sessionIdFromRequest(request);
    // MSW-1: replaces emptySportProfiles.ts's overrideSportProfilesToEmpty.
    if (getOverrides(sessionId).sportProfilesEmpty) {
      return HttpResponse.json(apiResponse([], 'User profiles retrieved successfully'));
    }
    return HttpResponse.json(
      apiResponse<UserSportProfileResponse[]>(
        sportSessions.get(sessionId).userSportProfilesState,
        'User profiles retrieved successfully',
      ),
    );
  }),

  http.get('/api/sports', () => {
    return HttpResponse.json(apiResponse(mockSportCatalog, 'Sports retrieved successfully'));
  }),

  // ─── ADMIN-2 ───────────────────────────────────────────────────────────────
  // Admin-only in the real backend (@PreAuthorize hasRole('ADMIN')); these mirror
  // the auth requirement only as far as "must be authenticated" — role enforcement
  // is the server's job and the client never branches on it.
  http.get('/api/sports/all', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sportSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(
      apiResponse(session.adminSportCatalogState, 'All sports retrieved successfully'),
    );
  }),

  // A11's admin twin: resolves regardless of active state, matching what the PUT accepts.
  // This is what the admin editor reads.
  http.get('/api/sports/all/:sportId/attribute-schema', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sportSessions.get(sessionIdFromRequest(request));
    const sportId = Number(params.sportId);
    if (!session.adminSportCatalogState.some((entry) => entry.id === sportId)) {
      return HttpResponse.json(apiError('Sport not found with id: ' + sportId), { status: 404 });
    }
    return HttpResponse.json(
      apiResponse(
        session.attributeSchemaState[sportId] ?? null,
        'Attribute schema retrieved successfully',
      ),
    );
  }),

  // The member-facing read, still active-only (A6/A7 invisibility). Kept here — and kept
  // 404-ing for an inactive sport — so that a regression pointing the admin editor back at
  // this path fails a test instead of passing silently. SPORT-2 will consume this one.
  http.get('/api/sports/:sportId/attribute-schema', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sportSessions.get(sessionIdFromRequest(request));
    const sportId = Number(params.sportId);
    const sport = session.adminSportCatalogState.find((entry) => entry.id === sportId);
    if (!sport || !sport.isActive) {
      return HttpResponse.json(apiError('Sport not found with id: ' + sportId), { status: 404 });
    }
    return HttpResponse.json(
      apiResponse(
        session.attributeSchemaState[sportId] ?? null,
        'Attribute schema retrieved successfully',
      ),
    );
  }),

  http.put('/api/sports/:sportId/attribute-schema', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sportSessions.get(sessionIdFromRequest(request));
    const sportId = Number(params.sportId);
    // findById server-side, not the active-only cache — an inactive sport IS writable.
    if (!session.adminSportCatalogState.some((entry) => entry.id === sportId)) {
      return HttpResponse.json(apiError('Sport not found with id: ' + sportId), { status: 404 });
    }
    const body = (await request.json()) as SportAttributeSchema | null;
    // One stand-in for A9's real validator, enough to exercise the "server rejected it,
    // render the message verbatim" path without reimplementing the rest of its rules.
    if (body && body.version === undefined) {
      return HttpResponse.json(apiError('Attribute schema must declare a version'), {
        status: 400,
      });
    }
    const groupKeys = (body?.groups ?? []).map((group) => group.key);
    const duplicate = groupKeys.find((key, index) => groupKeys.indexOf(key) !== index);
    if (duplicate !== undefined) {
      return HttpResponse.json(apiError('Duplicate group key: ' + duplicate), { status: 400 });
    }
    session.attributeSchemaState[sportId] = body;
    return HttpResponse.json(apiResponse(body, 'Attribute schema updated successfully'));
  }),

  http.put('/api/sports/:sportId', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sportSessions.get(sessionIdFromRequest(request));
    const sportId = Number(params.sportId);
    const existing = session.adminSportCatalogState.find((entry) => entry.id === sportId);
    if (!existing) {
      return HttpResponse.json(apiError('Sport not found with id: ' + sportId), { status: 404 });
    }
    const body = (await request.json()) as Partial<SportResponse>;
    // sports.name is UNIQUE at the DB level. This used to arrive as an opaque 500 — no
    // existsByName guard in updateSport, and no DataIntegrityViolationException case in
    // GlobalExceptionHandler — which this handler mirrored deliberately. A11 (shipped with
    // ADMIN-2) added the guard, so the real response is now this readable 400, verified live.
    if (
      body.name !== undefined &&
      session.adminSportCatalogState.some(
        (entry) => entry.id !== sportId && entry.name === body.name,
      )
    ) {
      return HttpResponse.json(
        apiError("Sport with name '" + body.name + "' already exists"),
        { status: 400 },
      );
    }
    // null-means-skip, exactly like SportServiceImpl.updateSport.
    const updated: SportResponse = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== null && value !== undefined),
      ),
      updatedAt: new Date().toISOString(),
    };
    session.adminSportCatalogState = session.adminSportCatalogState.map((entry) =>
      entry.id === sportId ? updated : entry,
    );
    return HttpResponse.json(apiResponse(updated, 'Sport updated successfully'));
  }),

  http.post('/api/sports/profiles', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      sportId: number;
      skillLevel: string;
      yearsOfExperience?: number;
    };
    const session = sportSessions.get(sessionIdFromRequest(request));
    if (session.userSportProfilesState.some((profile) => profile.sportId === body.sportId)) {
      return HttpResponse.json(apiError('Already has a profile for this sport'), { status: 400 });
    }
    if (session.userSportProfilesState.length >= 3) {
      return HttpResponse.json(apiError('Maximum number of sport profiles reached'), {
        status: 400,
      });
    }
    const created: UserSportProfileResponse = {
      id: session.nextProfileId++,
      userId: mockUser.id,
      sportId: body.sportId,
      sportName: mockSportCatalog.find((sport) => sport.id === body.sportId)?.name ?? 'Unknown',
      skillLevel: body.skillLevel,
      yearsOfExperience: body.yearsOfExperience ?? null,
      preferredPosition: null,
      bio: null,
      attributes: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.userSportProfilesState = [...session.userSportProfilesState, created];
    return HttpResponse.json(apiResponse(created, 'Sport profile created successfully'), {
      status: 201,
    });
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetSportHandlersState(sessionId: string): void {
  sportSessions.reset(sessionId);
}

/**
 * GRP-8 bug fix — the `sportProfilesEmpty` override used to only fake the
 * GET response, leaving the real `userSportProfilesState` at its default
 * (every sport the mock catalog serves — 2, post-SPORT-3) underneath. That
 * was fine for tests that only ever read the list (e.g. "zero sport profiles
 * renders without error"), but broke the first test to also POST a new
 * profile afterward: the create handler checked the real (still full) state
 * and 400'd with "Already has a profile for this sport" for Pickleball,
 * since the default fixture already includes it. Called alongside
 * `setOverride(sessionId, 'sportProfilesEmpty')` so the real state actually
 * is empty, not just the faked response.
 */
export function seedZeroSportProfilesState(sessionId: string): void {
  sportSessions.get(sessionId).userSportProfilesState = [];
}

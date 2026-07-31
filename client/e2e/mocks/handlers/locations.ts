import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { Location } from '../../../src/shared/types/location.ts';
import { mockLocation, mockUser } from '../fixtures.ts';
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

function mockPageResponse<T>(content: T[]) {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: Math.max(content.length, 20),
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

interface LocationsSession {
  locationsState: Location[];
  nextLocationId: number;
}

// CLIENT-SESSION-1: stateful, same reasoning as groups.ts's userGroupsState —
// a location created via POST /locations must actually appear in a later
// GET /locations/search for LocationPicker's own reused-across-sessions story
// to hold up in e2e, even though this ticket's own journey only exercises
// searching the pre-seeded mockLocation.
function defaultLocationsSession(): LocationsSession {
  return { locationsState: [mockLocation], nextLocationId: 100 };
}

const locationsSessions = createSessionStore(defaultLocationsSession);

export const locationHandlers: HttpHandler[] = [
  http.post('/api/locations', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      sportId: number;
      name: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      sourceMapsUrl?: string;
    };
    const session = locationsSessions.get(sessionIdFromRequest(request));
    const created: Location = {
      id: session.nextLocationId++,
      sportId: body.sportId,
      sportName: body.sportId === mockLocation.sportId ? mockLocation.sportName : 'Unknown',
      name: body.name,
      address: body.address ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      sourceMapsUrl: body.sourceMapsUrl ?? null,
      claimedByVendorId: null,
      createdBy: mockUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.locationsState = [...session.locationsState, created];
    return HttpResponse.json(apiResponse(created, 'Location created successfully'), { status: 201 });
  }),

  http.get('/api/locations/search', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const sportId = url.searchParams.get('sportId');
    const q = url.searchParams.get('q');
    let results = locationsSessions.get(sessionIdFromRequest(request)).locationsState;
    if (sportId !== null) {
      results = results.filter((location) => location.sportId === Number(sportId));
    }
    if (q !== null && q !== '') {
      results = results.filter((location) => location.name.toLowerCase().includes(q.toLowerCase()));
    }
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Locations retrieved successfully'));
  }),

  http.get('/api/locations/:locationId', ({ request, params }) => {
    const locationId = Number(params.locationId);
    const location = locationsSessions
      .get(sessionIdFromRequest(request))
      .locationsState.find((candidate) => candidate.id === locationId);
    if (!location) {
      return HttpResponse.json(apiError('Location not found'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(location, 'Location retrieved successfully'));
  }),

  // No paste-a-link flow exercised in this ticket's e2e journey — the create
  // flow searches the pre-seeded mockLocation instead (see matches-journey.spec.ts).
  // Handler still exists so LocationPicker's create-mode doesn't 404 if a
  // future spec exercises it.
  http.post('/api/locations/resolve-maps-url', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(
      apiResponse({ latitude: null, longitude: null, suggestedName: null }, 'URL resolved'),
    );
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetLocationHandlersState(sessionId: string): void {
  locationsSessions.reset(sessionId);
}

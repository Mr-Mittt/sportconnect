import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { UserSportProfileResponse } from '../../../src/shared/types/sport.ts';
import { mockSportProfiles, mockUser } from '../fixtures.ts';

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

// Minimal shape of the real `SportResponse` — no client type consumes this
// catalog endpoint yet (SPORT-1 maps sport profiles via the static
// SPORT_PROFILE_CONFIG, not this response), but the handler exists per the
// ticket's deliverables for when the add-sport flow is scoped. Ids/names
// match `V003__create_sports_tables.sql`'s INSERT order.
const mockSportCatalog = [
  { id: 1, name: 'Badminton', category: null, iconUrl: '/images/sports/badminton.png', isActive: true },
  { id: 2, name: 'Tennis', category: null, iconUrl: '/images/sports/tennis.png', isActive: true },
  { id: 5, name: 'Soccer', category: null, iconUrl: '/images/sports/soccer.png', isActive: true },
  { id: 6, name: 'Basketball', category: null, iconUrl: '/images/sports/basketball.png', isActive: true },
];

// Stateful, same reasoning as groups.ts's userGroupsState — a profile
// created via POST /sports/profiles must actually appear on the next GET
// /sports/profiles/user/:userId, since useAddSportProfile's own optimistic
// cache write would otherwise be clobbered by the mutation's background
// invalidate+refetch if this were a fixed responder.
let userSportProfilesState: UserSportProfileResponse[] = mockSportProfiles;
let nextProfileId = 100;

export const sportHandlers: HttpHandler[] = [
  // Public GET — no auth required (SportController's @Operation(security = {})).
  http.get('/api/sports/profiles/user/:userId', () => {
    return HttpResponse.json(
      apiResponse<UserSportProfileResponse[]>(
        userSportProfilesState,
        'User profiles retrieved successfully',
      ),
    );
  }),

  http.get('/api/sports', () => {
    return HttpResponse.json(apiResponse(mockSportCatalog, 'Sports retrieved successfully'));
  }),

  http.post('/api/sports/profiles', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      sportId: number;
      skillLevel: string;
      yearsOfExperience?: number;
    };
    if (userSportProfilesState.some((profile) => profile.sportId === body.sportId)) {
      return HttpResponse.json(apiError('Already has a profile for this sport'), { status: 400 });
    }
    if (userSportProfilesState.length >= 3) {
      return HttpResponse.json(apiError('Maximum number of sport profiles reached'), {
        status: 400,
      });
    }
    const created: UserSportProfileResponse = {
      id: nextProfileId++,
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
    userSportProfilesState = [...userSportProfilesState, created];
    return HttpResponse.json(apiResponse(created, 'Sport profile created successfully'), {
      status: 201,
    });
  }),
];

/** Test-only reset — same pattern as groups.ts's resetGroupHandlersState. */
export function resetSportHandlersState(): void {
  userSportProfilesState = mockSportProfiles;
  nextProfileId = 100;
}

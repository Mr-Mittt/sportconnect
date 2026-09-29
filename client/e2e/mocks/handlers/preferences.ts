import { http, HttpResponse, type HttpHandler } from 'msw';
import type { UserPreferenceResponse } from '../../../src/features/profile/types.ts';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

// Mirrors `UpdatePreferencesPayload` (`src/features/profile/useUpdateMyPreferences.ts`) — defined
// locally rather than imported from that hook file, which has a real (non-type-only) `apiClient`
// import that transitively reaches `localeStore.ts`'s `document` use; this e2e mock project's
// tsconfig (`tsconfig.node.json`) has no DOM lib, so pulling that file's runtime imports into this
// program fails to typecheck. `types.ts` above has no such runtime imports, so it's safe to import.
interface UpdatePreferencesPayload {
  language: string;
}

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

interface PreferencesSession {
  preferencesState: UserPreferenceResponse;
}

// CLIENT-I18N-1: RootLayout's useSyncUserLocale fetches this unconditionally for every
// authenticated session — `language: null` (no preference set) so no existing e2e spec's
// locale is touched by this handler landing. A test exercising the tier-1 override sets its own
// language via localStorage's `locale-storage` key directly, or (CLIENT-REF-3) saves a real
// language through EditProfileModal and observes it persist across a refetch.
function defaultPreferencesSession(): PreferencesSession {
  return {
    preferencesState: {
      language: null,
      timezone: null,
      distanceUnit: null,
      notificationEmail: null,
      notificationPush: null,
      notificationSms: null,
      privacyProfile: null,
      privacyLocation: null,
      createdAt: null,
      updatedAt: null,
    },
  };
}

// CLIENT-REF-3: stateful now (was a fixed GET-only stub) — a saved language must actually be
// reflected on the next read, same "small stateful fake backend" reasoning as friends.ts's
// myProfileState, so useSyncUserLocale's UI-language switch is e2e-verifiable.
const preferencesSessions = createSessionStore(defaultPreferencesSession);

export const preferenceHandlers: HttpHandler[] = [
  http.get('/api/users/me/preferences', ({ request }) => {
    const session = preferencesSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(apiResponse(session.preferencesState));
  }),

  http.put('/api/users/me/preferences', async ({ request }) => {
    const body = (await request.json()) as UpdatePreferencesPayload;
    const session = preferencesSessions.get(sessionIdFromRequest(request));
    const updated: UserPreferenceResponse = {
      ...session.preferencesState,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    session.preferencesState = updated;
    return HttpResponse.json(apiResponse(updated, 'Preferences updated successfully'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetPreferenceHandlersState(sessionId: string): void {
  preferencesSessions.reset(sessionId);
}

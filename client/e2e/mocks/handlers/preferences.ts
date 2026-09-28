import { http, HttpResponse, type HttpHandler } from 'msw';
import type { UserPreferenceResponse } from '../../../src/features/profile/types.ts';
import type { ApiResponse } from '../../../src/shared/types/api.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

// CLIENT-I18N-1: RootLayout's useSyncUserLocale fetches this unconditionally for every
// authenticated session — `language: null` (no preference set) so no existing e2e spec's
// locale is touched by this handler landing. A test exercising the tier-1 override sets its own
// language via localStorage's `locale-storage` key directly (no picker UI ships in this ticket).
const defaultPreferences: UserPreferenceResponse = {
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
};

export const preferenceHandlers: HttpHandler[] = [
  http.get('/api/users/me/preferences', () => {
    return HttpResponse.json(apiResponse(defaultPreferences));
  }),
];

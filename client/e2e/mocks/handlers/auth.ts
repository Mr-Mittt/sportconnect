import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AuthResult, LoginPayload, RegisterPayload } from '../../../src/features/auth/types.ts';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import { mockAccessToken, mockPassword, mockRefreshToken, mockUser } from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

// Mirrors AuthController.buildRefreshCookie (HttpOnly, Path=/api/auth,
// SameSite=Strict) closely enough for the client to never touch it directly —
// the client isn't supposed to read this cookie, only send it back.
function refreshCookie(token: string, maxAgeSeconds: number): string {
  return `refreshToken=${token}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

const authResult: AuthResult = {
  accessToken: mockAccessToken,
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: mockUser,
};

export const authHandlers: HttpHandler[] = [
  http.post('/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as RegisterPayload;
    if (!body.email || !body.password || !body.fullName) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    return HttpResponse.json(apiResponse(authResult, 'User registered successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
    });
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginPayload;
    if (body.email !== mockUser.email || body.password !== mockPassword) {
      return HttpResponse.json(apiError('Invalid email or password'), { status: 401 });
    }
    return HttpResponse.json(apiResponse(authResult, 'Login successful'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
    });
  }),

  // Reads the real browser cookie jar (via the `cookies` resolver arg) — the
  // mock server sits above the cookie layer as a genuine HTTP endpoint, same
  // as production (MSW-1: no longer a Service Worker synthesizing this, a
  // real response the browser's own cookie jar processes). A missing/stale
  // cookie mirrors the real AuthController's 401 (never Spring's default 400
  // for a missing cookie).
  http.post('/api/auth/refresh', ({ request, cookies }) => {
    // MSW-1: replaces expireSession.ts's overrideRefreshToExpired — simulates
    // a refresh token that was valid at login but revoked/expired server-side
    // sometime after (AUTH-8's step 6 scenario).
    if (getOverrides(sessionIdFromRequest(request)).refreshExpired) {
      return HttpResponse.json(apiError('Refresh token expired'), { status: 401 });
    }
    if (cookies.refreshToken !== mockRefreshToken) {
      return HttpResponse.json(apiError('Refresh token missing'), { status: 401 });
    }
    return HttpResponse.json(apiResponse(authResult, 'Token refreshed successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
    });
  }),

  http.post('/api/auth/logout', ({ request }) => {
    if (!request.headers.get('Authorization')) {
      return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
    }
    return HttpResponse.json(apiResponse(null, 'Logged out successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie('', 0) },
    });
  }),
];

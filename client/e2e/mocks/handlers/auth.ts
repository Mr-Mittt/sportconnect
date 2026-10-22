import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AuthResult, CallbackPayload } from '../../../src/features/auth/types.ts';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import {
  mockAccessToken,
  mockAdminRefreshToken,
  mockAdminUser,
  mockPassword,
  mockReactivationTicket,
  mockRefreshToken,
  mockUser,
} from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string, errorCode?: string, errorParams?: Record<string, unknown>): ApiResponse<null> {
  return {
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    ...(errorParams ? { errorParams } : {}),
    data: null,
    timestamp: new Date().toISOString(),
  };
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
  expiresIn: 300,
  user: mockUser,
};

// ADMIN-1: the same shape for the ADMIN-holding account. Kept as a separate
// constant rather than mutating `authResult` so every existing test keeps the
// exact response it had before.
const adminAuthResult: AuthResult = { ...authResult, user: mockAdminUser };

/**
 * ADMIN-1: which account a session belongs to, resolved from the refresh cookie.
 * Each account has its own token string, so a bootstrap refresh returns the user
 * who actually logged in instead of always returning mockUser — without this an
 * admin navigating to /admin would be re-identified as a plain USER on mount.
 * Returns null for a missing/unknown cookie, which the caller turns into a 401.
 */
function sessionFor(refreshToken: string | undefined): AuthResult | null {
  if (refreshToken === mockRefreshToken) return authResult;
  if (refreshToken === mockAdminRefreshToken) return adminAuthResult;
  return null;
}

export const authHandlers: HttpHandler[] = [
  // AUTH-14 / backend A26: finishes a Keycloak sign-in. The browser-level Keycloak stand-in
  // (mocks/keycloakStub.ts) sends the app back with one of three codes: `user-code` and
  // `admin-code` answer the account's session plus its refresh cookie; `deactivated-code` answers
  // the real 401 ACCOUNT_DEACTIVATED with the ticket in `errorParams.reactivationTicket` (no
  // cookie); anything else is 401 AUTH_CODE_INVALID. A verifier outside 43 to 128 characters is the
  // 400 the backend's bean validation gives.
  http.post('/api/auth/callback', async ({ request }) => {
    const body = (await request.json()) as CallbackPayload;
    if (!body.codeVerifier || body.codeVerifier.length < 43 || body.codeVerifier.length > 128) {
      return HttpResponse.json(
        apiError('Validation failed', 'VALIDATION_FAILED', { fields: { codeVerifier: 'size must be between 43 and 128' } }),
        { status: 400 },
      );
    }
    if (body.code === 'deactivated-code') {
      return HttpResponse.json(
        apiError('Account is deactivated', 'ACCOUNT_DEACTIVATED', { reactivationTicket: mockReactivationTicket }),
        { status: 401 },
      );
    }
    if (body.code === 'admin-code') {
      return HttpResponse.json(apiResponse(adminAuthResult, 'Login successful'), {
        status: 200,
        headers: { 'Set-Cookie': refreshCookie(mockAdminRefreshToken, 604800) },
      });
    }
    if (body.code === 'user-code') {
      return HttpResponse.json(apiResponse(authResult, 'Login successful'), {
        status: 200,
        headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
      });
    }
    return HttpResponse.json(apiError('Invalid authorization code', 'AUTH_CODE_INVALID'), { status: 401 });
  }),

  // AUTH-14 / backend A26: confirms re-activation with the one-time ticket. The one known ticket
  // logs the user in; anything else is 401 REACTIVATION_TICKET_INVALID.
  http.post('/api/auth/reactivate', async ({ request }) => {
    const body = (await request.json()) as { ticket?: string };
    if (body.ticket !== mockReactivationTicket) {
      return HttpResponse.json(apiError('Invalid reactivation ticket', 'REACTIVATION_TICKET_INVALID'), { status: 401 });
    }
    return HttpResponse.json(apiResponse(authResult, 'Account reactivated'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
    });
  }),

  // AUTH-14 / backend A26: declining always answers 200, known ticket or not.
  http.post('/api/auth/reactivate/cancel', () => HttpResponse.json(apiResponse(null, 'Reactivation cancelled'))),

  // ACCOUNT-4 / backend U22: self-deactivation. The right password answers 200; anything else is the
  // 400 CURRENT_PASSWORD_INCORRECT the real service throws. (Stateless like the rest of this file: the
  // mock account is not actually marked inactive.)
  http.post('/api/users/me/deactivate', async ({ request }) => {
    const body = (await request.json()) as { currentPassword?: string };
    if (!body.currentPassword?.trim()) {
      return HttpResponse.json(
        apiError('Validation failed', 'VALIDATION_FAILED', { fields: { currentPassword: 'Current password is required' } }),
        { status: 400 },
      );
    }
    if (body.currentPassword !== mockPassword) {
      return HttpResponse.json(apiError('Current password is incorrect', 'CURRENT_PASSWORD_INCORRECT'), { status: 400 });
    }
    return HttpResponse.json(apiResponse(null, 'Account deactivated successfully'));
  }),

  // ACCOUNT-3: PUT /api/users/me/password mirrors UserController.changePassword — @NotBlank current,
  // @Size(min = 8) new (400 VALIDATION_FAILED with per-field errors), then 400 CURRENT_PASSWORD_INCORRECT.
  http.put('/api/users/me/password', async ({ request }) => {
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    const fields: Record<string, string> = {};
    if (!body.currentPassword?.trim()) fields.currentPassword = 'Current password is required';
    if (!body.newPassword?.trim()) fields.newPassword = 'New password is required';
    else if (body.newPassword.length < 8) fields.newPassword = 'Password must be at least 8 characters';
    if (Object.keys(fields).length > 0) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED', { fields }), { status: 400 });
    }
    if (body.currentPassword !== mockPassword) {
      return HttpResponse.json(apiError('Current password is incorrect', 'CURRENT_PASSWORD_INCORRECT'), { status: 400 });
    }
    return HttpResponse.json(apiResponse(null, 'Password changed successfully'));
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
    // ADMIN-1: resolves which account the cookie belongs to instead of assuming
    // mockUser, so an admin's session survives a navigation with its roles intact.
    const session = sessionFor(cookies.refreshToken);
    if (!session) {
      return HttpResponse.json(apiError('Refresh token missing'), { status: 401 });
    }
    const token = session === adminAuthResult ? mockAdminRefreshToken : mockRefreshToken;
    return HttpResponse.json(apiResponse(session, 'Token refreshed successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(token, 604800) },
    });
  }),

  // AUTH-14 / backend A26: logout is public and driven by the refresh cookie (no Bearer needed), and
  // no cookie is still 200. The 503 "Keycloak unreachable" case is simulated per test with
  // `page.route`, since it is a browser-visible failure rather than mock state.
  http.post('/api/auth/logout', () =>
    HttpResponse.json(apiResponse(null, 'Logged out successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie('', 0) },
    }),
  ),
];

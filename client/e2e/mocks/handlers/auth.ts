import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AuthResult, LoginPayload, RegisterPayload } from '../../../src/features/auth/types.ts';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import {
  mockAccessToken,
  mockAdminRefreshToken,
  mockAdminUser,
  mockExpiredResetToken,
  mockPassword,
  mockRefreshToken,
  mockResetToken,
  mockTakenEmail,
  mockUsedResetToken,
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
  expiresIn: 3600,
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
  // CLIENT-REF-2: `body` is typed against the widened `RegisterPayload` (adds optional
  // languageCode/countryId/regionId/latitude/longitude, 1:1 with backend U16's RegisterRequest),
  // but this handler still only validates the original three required fields — the new ones are
  // genuinely optional and the response's `user` doesn't echo them back either (verified against
  // AuthServiceImpl.toUserResponse(), see CLIENT-REF-2's ticket doc), so there's nothing else for
  // this handler to do with them. e2e specs assert what was actually sent via the real outgoing
  // request (`page.on('request')`), not via anything this handler echoes.
  http.post('/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as RegisterPayload;
    // Mirrors RegisterRequest's @NotBlank rules, which the form's own checks do not fully cover
    // (a password of 8 spaces passes the client's length rule, not the server's blank rule).
    const fields: Record<string, string> = {};
    if (!body.email?.trim()) fields.email = 'Email is required';
    if (!body.password?.trim()) fields.password = 'Password is required';
    if (!body.fullName?.trim()) fields.fullName = 'Full name is required';
    if (Object.keys(fields).length > 0) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED', { fields }), { status: 400 });
    }
    // CLIENT-ERR-2: a fixed taken address, so a spec can reach the duplicate-email (409) path.
    if (body.email === mockTakenEmail) {
      return HttpResponse.json(apiError('Email already registered', 'EMAIL_ALREADY_REGISTERED'), { status: 409 });
    }
    return HttpResponse.json(apiResponse(authResult, 'User registered successfully'), {
      status: 200,
      headers: { 'Set-Cookie': refreshCookie(mockRefreshToken, 604800) },
    });
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as LoginPayload;
    if (body.password !== mockPassword) {
      return HttpResponse.json(apiError('Invalid email or password', 'INVALID_CREDENTIALS'), { status: 401 });
    }
    // ADMIN-1: two accounts now exist. Each gets its own refresh-token string so
    // a later bootstrap refresh can tell them apart (see sessionFor).
    if (body.email === mockAdminUser.email) {
      return HttpResponse.json(apiResponse(adminAuthResult, 'Login successful'), {
        status: 200,
        headers: { 'Set-Cookie': refreshCookie(mockAdminRefreshToken, 604800) },
      });
    }
    if (body.email !== mockUser.email) {
      return HttpResponse.json(apiError('Invalid email or password', 'INVALID_CREDENTIALS'), { status: 401 });
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

  // AUTH-9: mirrors AuthController.forgotPassword — the same 200 whether or not the email has an
  // account (anti-enumeration), 400 only for a blank/malformed address.
  http.post('/api/auth/forgot-password', async ({ request }) => {
    const body = (await request.json()) as { email?: string };
    if (!body.email?.trim()) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED', { fields: { email: 'Email is required' } }), {
        status: 400,
      });
    }
    return HttpResponse.json(apiResponse(null, 'If the email exists, a password reset link has been sent'));
  }),

  // AUTH-9: mirrors AuthController.resetPassword and the A8 codes — 404 RESET_TOKEN_INVALID for an
  // unknown token, 400 RESET_TOKEN_USED / RESET_TOKEN_EXPIRED for the two fixed tokens, 400
  // VALIDATION_FAILED for a password under 8 characters.
  http.post('/api/auth/reset-password', async ({ request }) => {
    const body = (await request.json()) as { token?: string; newPassword?: string };
    if (!body.newPassword || body.newPassword.length < 8) {
      return HttpResponse.json(
        apiError('Validation failed', 'VALIDATION_FAILED', { fields: { newPassword: 'Password must be at least 8 characters' } }),
        { status: 400 },
      );
    }
    if (body.token === mockUsedResetToken) {
      return HttpResponse.json(apiError('Reset token already used', 'RESET_TOKEN_USED'), { status: 400 });
    }
    if (body.token === mockExpiredResetToken) {
      return HttpResponse.json(apiError('Reset token expired', 'RESET_TOKEN_EXPIRED'), { status: 400 });
    }
    if (body.token !== mockResetToken) {
      return HttpResponse.json(apiError('Invalid reset token', 'RESET_TOKEN_INVALID'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(null, 'Password reset successfully'));
  }),

  // AUTH-9 / backend A21: the page-load check. 200 only for the one live token; every other token
  // (unknown, used, expired) gets the same generic 404 RESET_TOKEN_INVALID, like the real backend.
  http.post('/api/auth/reset-password/validate', async ({ request }) => {
    const body = (await request.json()) as { token?: string };
    if (!body.token?.trim()) {
      return HttpResponse.json(apiError('Validation failed', 'VALIDATION_FAILED', { fields: { token: 'Token is required' } }), {
        status: 400,
      });
    }
    if (body.token !== mockResetToken) {
      return HttpResponse.json(apiError('Invalid reset token', 'RESET_TOKEN_INVALID'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(null, 'Reset token is valid'));
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

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/app/authStore';
import { useLocaleStore } from '@/app/localeStore';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult } from '@/features/auth/types';

/**
 * Attaches the in-memory access token as `Authorization: Bearer`. Exported
 * separately (not inlined into `.interceptors.request.use()`) so it can be
 * unit-tested directly without mocking axios's internals.
 */
export function attachAuthHeader(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
}

/**
 * CLIENT-I18N-1 (`I18N_READINESS.md` I18N-2): sends the in-app locale as `Accept-Language` so
 * server-side, locale-resolved responses (A13's attribute-schema labels) follow the UI's chosen
 * language rather than the browser's own `Accept-Language`, which may disagree with it. Exported
 * separately for the same testability reason as `attachAuthHeader`.
 */
export function attachAcceptLanguageHeader(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const { locale } = useLocaleStore.getState();
  config.headers.set('Accept-Language', locale);
  return config;
}

// Shared factory so a second backend (chat's own service, CHAT-7) gets the
// same auth-attach + 401-silent-refresh-and-retry behavior without
// duplicating it — the only thing that varies per client is baseURL and,
// on a 401, which client the original request gets replayed on.
// withCredentials is required so the httpOnly refresh cookie is sent/received
// (the refresh cookie itself is Path-scoped to /api/auth, so this is a no-op
// for any client other than the default one, but harmless to set uniformly).
// paramsSerializer.indexes: null makes an array-valued param (e.g. sportIds: [1, 2])
// serialize as repeated bare keys (?sportIds=1&sportIds=2) instead of axios's default
// bracket notation (?sportIds[]=1&sportIds[]=2) — Spring's List<Long> @RequestParam
// binding only understands the bare-repeated-key form (verified live against A10).
export function createAuthenticatedClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    withCredentials: true,
    paramsSerializer: { indexes: null },
  });

  client.interceptors.request.use(attachAuthHeader);
  client.interceptors.request.use(attachAcceptLanguageHeader);
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => handleResponseError(error, client),
  );

  return client;
}

// `/api` is proxied to the Spring Boot backend at :8080 in dev (vite.config.ts).
export const apiClient = createAuthenticatedClient('/api');

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Requests that must never trigger a silent-refresh-and-retry:
// - /auth/refresh itself, or a 401 here would recurse into another refresh attempt.
// - /auth/callback, /auth/reactivate, /auth/reactivate/cancel (AUTH-14): a 401 there is "this code
//   or ticket is no good" (or ACCOUNT_DEACTIVATED), not "expired session" — there's no original
//   session to restore, and silently refreshing could resurrect a stale one from an unrelated
//   valid cookie the user didn't ask for.
const NO_RETRY_URLS = [
  '/auth/refresh',
  '/auth/callback',
  '/auth/reactivate',
  '/auth/reactivate/cancel',
];

// Shared by every caller that needs a fresh access token (the 401 handler, the notification socket,
// the chat socket), so a page that asks several times at once triggers exactly one /auth/refresh
// call. Refresh-token rotation is off in this realm (`revokeRefreshToken` off, auth A26/A28), so
// concurrent refreshes would succeed anyway, but one call is cheaper and stays correct if rotation
// is ever switched on (a second call would then read the already-revoked cookie and get a 401).
let refreshPromise: Promise<string> | null = null;

/** True when `error` is the backend definitively refusing the refresh (a 4xx): the session is over.
 * A 5xx or no response at all (Keycloak or the network down) says nothing about the session. */
export function isDefiniteRefusal(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status < 500;
}

async function refreshAccessToken(): Promise<string> {
  const tokenAtStart = useAuthStore.getState().accessToken;
  try {
    const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/refresh');
    const result = response.data.data;
    useAuthStore.getState().setSession(result.user, result.accessToken);
    return result.accessToken;
  } catch (error) {
    // Only a definite refusal ends the session (AUTH-14), and only if the store still holds the token
    // this refresh started from: if anything renewed the session meanwhile, this late failure must
    // not sign the user out of a session that is fine (CLIENT-NOTIF-6).
    if (isDefiniteRefusal(error) && useAuthStore.getState().accessToken === tokenAtStart) {
      useAuthStore.getState().clearSession();
    }
    throw error;
  }
}

/**
 * Refreshes the access token through the httpOnly refresh cookie and stores the new session. Every
 * caller shares one in-flight request, so any number of components (REST 401s, the notification
 * socket, the chat socket) asking at once make a single `/auth/refresh` call. Resolves with the new
 * token. On failure it rejects with the original error; a definite refusal (4xx, see
 * {@link isDefiniteRefusal}) has already cleared the session, any other failure keeps it.
 */
export function refreshSession(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Response-interceptor error handler for AUTH-5's 401 silent-refresh-then-
 * retry-once flow. Exported separately (same reasoning as attachAuthHeader)
 * so it can be unit-tested by invoking it directly with a synthetic
 * AxiosError, rather than mocking axios's internal adapter pipeline.
 *
 * Flow: on a 401 that isn't already a retry and isn't one of NO_RETRY_URLS,
 * mark the request retried, await the shared refresh (kicking one off if
 * none is in flight), then replay the original request with the new token.
 * If the refresh itself fails (refresh token also invalid/expired), clears
 * the session and rejects with the *original* error — no manual redirect
 * here; ProtectedRoute already redirects to /login reactively once
 * authStore.user goes null (same pattern useLogout uses).
 *
 * `client` is which axios instance the original request gets replayed on
 * once refreshed — defaults to `apiClient` since that's this function's only
 * caller until CHAT-7 added a second one (`chatApiClient`); refreshing itself
 * always goes through `apiClient` regardless (the refresh endpoint only
 * exists on the monolith).
 */
export async function handleResponseError(
  error: AxiosError,
  client: AxiosInstance = apiClient,
): Promise<AxiosResponse> {
  const originalRequest = error.config as RetryableRequestConfig | undefined;

  if (
    error.response?.status !== 401 ||
    !originalRequest ||
    originalRequest._retry ||
    NO_RETRY_URLS.includes(originalRequest.url ?? '')
  ) {
    return Promise.reject(error);
  }

  originalRequest._retry = true;

  try {
    const accessToken = await refreshSession();
    originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
    return client.request(originalRequest);
  } catch {
    // refreshSession already ended the session on a definite refusal and kept it otherwise
    // (AUTH-14, CLIENT-NOTIF-6); the caller gets the original 401.
    return Promise.reject(error);
  }
}

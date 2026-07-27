import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/app/authStore';
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
// - /auth/login, /auth/register: a 401 there is "bad credentials", not "expired
//   session" — there's no original session to restore, and silently refreshing
//   could resurrect a stale one from an unrelated valid cookie the user didn't
//   ask for (e.g. a login-page retry with different, still-wrong credentials).
const NO_RETRY_URLS = ['/auth/refresh', '/auth/login', '/auth/register'];

// Shared across concurrent 401s so a page that fires several authenticated
// requests at once (all with the same stale token) triggers exactly one
// /auth/refresh call. The backend rotates the refresh token on every use and
// revokes the old one — a second, independent refresh call racing the first
// would read the same cookie and lose that race with a 401 of its own.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/refresh');
  const result = response.data.data;
  useAuthStore.getState().setSession(result.user, result.accessToken);
  return result.accessToken;
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

  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  try {
    const accessToken = await refreshPromise;
    originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
    return client.request(originalRequest);
  } catch {
    useAuthStore.getState().clearSession();
    return Promise.reject(error);
  }
}

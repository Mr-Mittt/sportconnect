import { createAuthenticatedClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';

// `/api/chat` is proxied straight to the chat service (services/chat, Go +
// Postgres) in dev — a separate backend from the Spring monolith, registered
// ahead of the plain '/api' proxy entry in vite.config.ts. Same auth-attach +
// 401-silent-refresh-and-retry behavior as `apiClient` (refreshing itself
// still goes through the monolith either way — see handleResponseError).
export const chatApiClient = createAuthenticatedClient('/api/chat');

/**
 * Builds the URL for GET /conversations/{id}/ws. The access token goes on
 * the query string (`?token=`) rather than an `Authorization` header — a
 * browser's native `WebSocket` constructor cannot set custom request headers
 * during the handshake, which is what necessitated
 * `auth.Verifier.MiddlewareWS`'s query-param fallback on the Go side (see
 * services/chat/internal/auth). Relative to the current page's origin, the
 * same way `chatApiClient`'s baseURL is relative rather than absolute — this
 * keeps working whether the app is served from localhost:5173 (dev, proxied)
 * or a single production origin (once INFRA-7's reverse proxy exists).
 */
export function buildChatWebSocketUrl(conversationId: number): string {
  const { accessToken } = useAuthStore.getState();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}/api/chat/conversations/${conversationId}/ws`);
  if (accessToken) {
    url.searchParams.set('token', accessToken);
  }
  return url.toString();
}

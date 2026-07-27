import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/app/authStore';
import { buildChatWebSocketUrl, chatApiClient } from './chatApiClient';

describe('chatApiClient', () => {
  it('is proxied through /api/chat, a separate backend from the monolith', () => {
    expect(chatApiClient.defaults.baseURL).toBe('/api/chat');
  });

  it('sends cookies on every request, same as apiClient', () => {
    expect(chatApiClient.defaults.withCredentials).toBe(true);
  });
});

describe('buildChatWebSocketUrl', () => {
  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('builds a ws:// URL for the conversation with the access token as a query param', () => {
    useAuthStore.setState({ accessToken: 'my-token' });

    const url = new URL(buildChatWebSocketUrl(42));

    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/api/chat/conversations/42/ws');
    expect(url.searchParams.get('token')).toBe('my-token');
  });

  it('omits the token param when there is no access token', () => {
    useAuthStore.setState({ accessToken: null });

    const url = new URL(buildChatWebSocketUrl(1));

    expect(url.searchParams.has('token')).toBe(false);
  });
});

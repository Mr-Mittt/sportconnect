import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { apiClient, attachAuthHeader } from './apiClient';
import { useAuthStore } from './authStore';

function fakeConfig(): InternalAxiosRequestConfig {
  return { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
}

describe('apiClient', () => {
  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('sends cookies on every request', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('is proxied through /api', () => {
    expect(apiClient.defaults.baseURL).toBe('/api');
  });
});

describe('attachAuthHeader', () => {
  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('attaches Authorization: Bearer when a token is present', () => {
    useAuthStore.setState({ accessToken: 'my-token' });

    const config = attachAuthHeader(fakeConfig());

    expect(config.headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('leaves Authorization unset when there is no token', () => {
    useAuthStore.setState({ accessToken: null });

    const config = attachAuthHeader(fakeConfig());

    expect(config.headers.get('Authorization')).toBeUndefined();
  });
});

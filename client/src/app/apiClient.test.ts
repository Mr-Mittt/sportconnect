import { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, attachAuthHeader, handleResponseError } from './apiClient';
import { useAuthStore } from './authStore';

function fakeConfig(): InternalAxiosRequestConfig {
  return { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
}

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function fakeRequest(url: string, extra?: Partial<RetryableConfig>): RetryableConfig {
  return { url, headers: new AxiosHeaders(), ...extra } as RetryableConfig;
}

function fake401(config: RetryableConfig): AxiosError {
  return {
    isAxiosError: true,
    response: { status: 401 },
    config,
  } as unknown as AxiosError;
}

const fixtureUser = {
  id: '1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

function fakeRefreshResponse(accessToken: string) {
  return {
    data: {
      success: true,
      message: 'Token refreshed successfully',
      data: { accessToken, tokenType: 'Bearer', expiresIn: 3600, user: fixtureUser },
      timestamp: new Date().toISOString(),
    },
  };
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

describe('handleResponseError', () => {
  afterEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('retries the original request once after a silent refresh succeeds', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(fakeRefreshResponse('new-token'));
    const requestSpy = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValueOnce({ data: 'retried-response' } as never);
    const originalRequest = fakeRequest('/posts/feed');

    const result = await handleResponseError(fake401(originalRequest));

    expect(postSpy).toHaveBeenCalledWith('/auth/refresh');
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(useAuthStore.getState().user?.email).toBe('jordan@example.com');
    expect(originalRequest.headers.get('Authorization')).toBe('Bearer new-token');
    expect(requestSpy).toHaveBeenCalledWith(originalRequest);
    expect((result as unknown as { data: string }).data).toBe('retried-response');
  });

  it('marks the retried request so it is not retried a second time', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(fakeRefreshResponse('new-token'));
    vi.spyOn(apiClient, 'request').mockResolvedValueOnce({ data: 'ok' } as never);
    const originalRequest = fakeRequest('/posts/feed');

    await handleResponseError(fake401(originalRequest));

    expect(originalRequest._retry).toBe(true);
  });

  it('does not retry a request that already carries _retry — prevents a retry loop', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const originalRequest = fakeRequest('/posts/feed', { _retry: true });

    await expect(handleResponseError(fake401(originalRequest))).rejects.toBeDefined();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('clears the session and rejects with the original error when the refresh itself fails', async () => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'stale-token' });
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    });
    const originalRequest = fakeRequest('/posts/feed');
    const error = fake401(originalRequest);

    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('does not attempt a refresh for a 401 from /auth/refresh itself (no recursive refresh)', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const originalRequest = fakeRequest('/auth/refresh');

    await expect(handleResponseError(fake401(originalRequest))).rejects.toBeDefined();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it.each(['/auth/login', '/auth/register'])(
    'does not attempt a refresh for a 401 from %s (bad credentials, not an expired session)',
    async (url) => {
      const postSpy = vi.spyOn(apiClient, 'post');
      const originalRequest = fakeRequest(url);

      await expect(handleResponseError(fake401(originalRequest))).rejects.toBeDefined();

      expect(postSpy).not.toHaveBeenCalled();
    },
  );

  it('passes through non-401 errors unchanged', async () => {
    const originalRequest = fakeRequest('/posts/feed');
    const error = {
      isAxiosError: true,
      response: { status: 500 },
      config: originalRequest,
    } as unknown as AxiosError;

    await expect(handleResponseError(error)).rejects.toBe(error);
  });

  it('dedupes concurrent 401s into a single /auth/refresh call', async () => {
    let resolveRefresh!: (value: ReturnType<typeof fakeRefreshResponse>) => void;
    const pendingRefresh = new Promise<ReturnType<typeof fakeRefreshResponse>>((resolve) => {
      resolveRefresh = resolve;
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValueOnce(pendingRefresh as never);
    const requestSpy = vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'ok' } as never);

    const requestA = fakeRequest('/posts/feed');
    const requestB = fakeRequest('/groups');

    const resultA = handleResponseError(fake401(requestA));
    const resultB = handleResponseError(fake401(requestB));

    resolveRefresh(fakeRefreshResponse('shared-token'));
    await Promise.all([resultA, resultB]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBe('shared-token');
  });
});

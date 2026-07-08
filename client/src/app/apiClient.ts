import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/app/authStore';

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

// `/api` is proxied to the Spring Boot backend at :8080 in dev (vite.config.ts).
// withCredentials is required so the httpOnly refresh cookie is sent/received.
export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

apiClient.interceptors.request.use(attachAuthHeader);

// Response interceptor stub — AUTH-5 fills this in with the 401 silent-
// refresh-then-retry-once flow. Pass-through for now.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import type { User } from '@/features/auth/types';

const testUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('never touches localStorage or sessionStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    useAuthStore.getState().setSession(testUser, 'access-token-123');
    useAuthStore.getState().clearSession();

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('setSession stores the user and access token', () => {
    useAuthStore.getState().setSession(testUser, 'access-token-123');

    expect(useAuthStore.getState().user).toEqual(testUser);
    expect(useAuthStore.getState().accessToken).toBe('access-token-123');
  });

  it('clearSession resets user and access token to null', () => {
    useAuthStore.getState().setSession(testUser, 'access-token-123');
    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('starts with isBootstrapping true', () => {
    expect(useAuthStore.getState().isBootstrapping).toBe(true);
  });
});

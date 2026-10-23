import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { usePasswordLockStore } from './passwordLockStore';

const user = {
  id: '1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

describe('passwordLockStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePasswordLockStore.getState().clear();
    useAuthStore.getState().clearSession();
  });
  afterEach(() => {
    usePasswordLockStore.getState().clear();
    vi.useRealTimers();
  });

  it('shows the full length at once, counts down, and stops at 0', () => {
    act(() => usePasswordLockStore.getState().lock(3));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(3);
    act(() => vi.advanceTimersByTime(2_000));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(0);
  });

  it('a second lock restarts it from the new length', () => {
    act(() => usePasswordLockStore.getState().lock(10));
    act(() => vi.advanceTimersByTime(4_000));
    act(() => usePasswordLockStore.getState().lock(60));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(60);
  });

  it('is cleared when a different user signs in or the session ends', () => {
    act(() => useAuthStore.getState().setSession(user, 'token-a'));
    act(() => usePasswordLockStore.getState().lock(600));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(600);

    act(() => useAuthStore.getState().clearSession());
    expect(usePasswordLockStore.getState().secondsLeft).toBe(0);

    act(() => useAuthStore.getState().setSession(user, 'token-a'));
    act(() => usePasswordLockStore.getState().lock(600));
    act(() => useAuthStore.getState().setSession({ ...user, id: '2' }, 'token-b'));
    expect(usePasswordLockStore.getState().secondsLeft).toBe(0);
  });
});

import type { User } from '../../src/features/auth/types.ts';

// Reused across AUTH-8 and FEED-10 rather than each test inventing its own
// ad-hoc response shapes (per MSW-0's acceptance criteria).
export const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

export const mockPassword = 'password123';
export const mockAccessToken = 'mock-access-token';

// A distinct refresh-token string used only to simulate the httpOnly cookie
// round-trip (set on login/register/refresh, checked on refresh/logout).
// Real tests never read this directly — the browser handles the cookie.
export const mockRefreshToken = 'mock-refresh-token';

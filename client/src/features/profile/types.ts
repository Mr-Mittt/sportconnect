// UpdateProfileRequest.bio's real server-side @Size(max = 500), same
// "constant sourced from the actual backend annotation" convention as
// MAX_POST_LENGTH/MAX_COMMENT_LENGTH in features/feed/types.ts.
export const MAX_BIO_LENGTH = 500;

/**
 * 1:1 with `UserResponse` (`modules/user/user-api`) — the full shape
 * `GET /api/users/{userId}` returns. `city`/`country` were added to the
 * backend response at this ticket's pickup (`toUserResponse()` was
 * persisting but never returning them, see `modules/user/user-impl/docs/
 * MVP/U11_...md`'s 2026-08-26 update) — this type reflects the fixed shape.
 *
 * `useMyProfile` is the only consumer — it returns this full type for the
 * logged-in user's own profile (`GET /api/users/me`). Any other user looked
 * up by id comes back as the PII-free `UserInfoResponse`, never this
 * (`GET /api/users/{userId}` since U11) — see `features/friends`'
 * `UserInfo` / `useUserInfo`.
 */
export interface UserResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  location: { latitude: number; longitude: number } | null;
  city: string | null;
  country: string | null;
  heightCm: number | null;
  weightKg: number | null;
  shoeSizeCm: number | null;
  isEmailVerified: boolean;
  isActive: boolean;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
  // Server-computed (UserResponse.getFullName()), always present.
  fullName: string;
}

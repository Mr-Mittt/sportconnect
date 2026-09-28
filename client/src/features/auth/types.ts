// Typed 1:1 against the real backend contracts, verified against source
// (not just the AUTH/FEED epic doc's illustrative sketch — see AUTH-0's
// implementation summary for the corrections that surfaced):
//
// - firstName/lastName/username are non-nullable `string`, not `string | null`.
//   AuthServiceImpl.toUserResponse() (auth-impl) coerces a missing name part to
//   "" before it ever reaches JSON — the key is always present, never null.
// - phoneNumber/avatarUrl are `string | null`. These were MISSING entirely from
//   AuthResponse.user until this ticket added them to toUserResponse() — login/
//   register/refresh previously returned only {id, email, firstName, lastName,
//   username, roles}, which would have left TopBar with no avatar source.
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  roles: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

// CLIENT-REF-2 / backend U16: optional geo/language extras on RegisterRequest. `countryId`/
// `regionId` mirror `CountryResponse.id`/`RegionResponse.id` (both `number` client-side, `Long`
// server-side, same convention as the reference types). Coordinates are sent together or not at
// all — only after a successful "Use my current location" click, never on their own.
export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  languageCode?: string;
  countryId?: number;
  regionId?: number;
  latitude?: number;
  longitude?: number;
}

// Matches AuthResponse (auth-api) as actually serialized: `refreshToken` is
// `@JsonIgnore`'d server-side — it never reaches JS, it arrives via an
// httpOnly Set-Cookie header instead (see modules/auth/docs/A2_*.md).
export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

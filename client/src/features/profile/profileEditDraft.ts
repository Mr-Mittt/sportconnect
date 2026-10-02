import type { UserResponse } from './types';

/**
 * The editable subset of `UserResponse` — 1:1 with `UpdateProfileRequest`
 * (`modules/user/user-api`), minus every sport-profile field (`PROFILE-4`'s
 * job, not this modal's).
 *
 * **CLIENT-REF-3:** `country` (free text) is gone — the server silently ignores it now (U16).
 * `countryId`/`regionId` replace it: per `UpdateProfileRequest`'s own "both together" rule, a
 * `countryId` present means `regionId` *replaces* the stored region (absent = cleared), so
 * `EditProfileModal` always sends both together whenever either changed, never one alone.
 * `city` is dropped too (replaced by `regionId` — see `types.ts`'s `UserResponse.city` doc).
 * `location` mirrors `UpdateProfileRequest.location` (`LocationRequest`) — only ever included
 * after a successful "Use my current location" click, same as sign-up (CLIENT-REF-2).
 */
export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  heightCm?: number;
  weightKg?: number;
  shoeSizeCm?: number;
  countryId?: number;
  regionId?: number;
  location?: { latitude: number; longitude: number };
}

/** The form's local draft — the plain-text fields only (Country/Region/Language live in
 * `useGeoLocaleFieldsData`'s own state, not here — see `EditProfileModal`). Every field is a
 * string because it is bound to an input — `heightCm`/`weightKg`/`shoeSizeCm` are converted back
 * to numbers only when they are sent (same shape `sportFieldsDraft.ts`'s
 * `minPlayers`/`maxPlayers` already use). */
export interface ProfileEditDraft {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  shoeSizeCm: string;
}

/** Seeds a draft from the server's row. Nulls become `''` so the inputs stay controlled. */
export function toProfileEditDraft(user: UserResponse): ProfileEditDraft {
  return {
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    username: user.username ?? '',
    bio: user.bio ?? '',
    avatarUrl: user.avatarUrl ?? '',
    coverUrl: user.coverUrl ?? '',
    phoneNumber: user.phoneNumber ?? '',
    dateOfBirth: user.dateOfBirth ?? '',
    gender: user.gender ?? '',
    heightCm: user.heightCm?.toString() ?? '',
    weightKg: user.weightKg?.toString() ?? '',
    shoeSizeCm: user.shoeSizeCm?.toString() ?? '',
  };
}

/** Geo selection change — compared against the profile's original `countryId`/`regionId` and
 * merged into the payload by `buildProfileUpdatePayload`'s caller (`EditProfileModal`), following
 * the "both together" rule: send both whenever either changed, never one alone. */
export interface GeoSelection {
  countryId: number | null;
  regionId: number | null;
  location: { latitude: number; longitude: number } | null;
}

/** Adds the Country/Region/location fields to an already-built text-field payload, applying the
 * "both together" rule against the profile's original `countryId`/`regionId` — split out of
 * `buildProfileUpdatePayload` since this half's inputs come from `useGeoLocaleFieldsData`'s own
 * state, not `ProfileEditDraft`. */
export function applyGeoSelection(
  payload: UpdateProfilePayload,
  user: UserResponse,
  geo: GeoSelection,
): UpdateProfilePayload {
  const result = { ...payload };
  if (geo.countryId !== user.countryId || geo.regionId !== user.regionId) {
    if (geo.countryId !== null) result.countryId = geo.countryId;
    if (geo.regionId !== null) result.regionId = geo.regionId;
  }
  if (geo.location !== null) {
    result.location = geo.location;
  }
  return result;
}

/**
 * Builds the `PUT /api/users/{userId}/profile` body from only the fields that
 * actually changed — same reasoning as `sportFieldsDraft.ts`'s
 * `buildUpdatePayload`: the endpoint is null-means-skip
 * (`UserServiceImpl.updateProfile()`), so sending everything every time would
 * rewrite untouched columns for no reason.
 *
 * Known limit inherited from that same null-means-skip rule: text fields
 * (`bio`/`city`/`country`/`phoneNumber`/`gender`/`avatarUrl`/`coverUrl`)
 * *can* be cleared back to `''` — an empty string is still non-null, so it
 * reaches the server and clears the column. `dateOfBirth`/`heightCm`/
 * `weightKg`/`shoeSizeCm` cannot: an emptied `dateOfBirth` would send an
 * unparsable empty date string (the server has no "unset" representation for
 * a `LocalDate`), and an emptied numeric field would send `0`/`NaN`, which
 * U7's own bounds validation (50–300 / 20–300 / 10–35) would reject anyway.
 * All four are omitted from the payload instead when cleared, same as
 * `sportFieldsDraft`'s `minPlayers`/`maxPlayers`.
 */
export function buildProfileUpdatePayload(
  user: UserResponse,
  draft: ProfileEditDraft,
): UpdateProfilePayload {
  const payload: UpdateProfilePayload = {};
  const original = toProfileEditDraft(user);

  if (draft.firstName !== original.firstName) payload.firstName = draft.firstName;
  if (draft.lastName !== original.lastName) payload.lastName = draft.lastName;
  if (draft.username !== original.username) payload.username = draft.username;
  if (draft.bio !== original.bio) payload.bio = draft.bio;
  if (draft.avatarUrl !== original.avatarUrl) payload.avatarUrl = draft.avatarUrl;
  if (draft.coverUrl !== original.coverUrl) payload.coverUrl = draft.coverUrl;
  if (draft.phoneNumber !== original.phoneNumber) payload.phoneNumber = draft.phoneNumber;
  if (draft.gender !== original.gender) payload.gender = draft.gender;

  if (draft.dateOfBirth !== original.dateOfBirth && draft.dateOfBirth !== '') {
    payload.dateOfBirth = draft.dateOfBirth;
  }
  if (draft.heightCm !== original.heightCm && draft.heightCm !== '') {
    payload.heightCm = Number(draft.heightCm);
  }
  if (draft.weightKg !== original.weightKg && draft.weightKg !== '') {
    payload.weightKg = Number(draft.weightKg);
  }
  if (draft.shoeSizeCm !== original.shoeSizeCm && draft.shoeSizeCm !== '') {
    payload.shoeSizeCm = Number(draft.shoeSizeCm);
  }

  return payload;
}

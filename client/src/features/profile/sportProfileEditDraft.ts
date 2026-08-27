import type { UserSportProfileResponse } from '@/shared/types/sport';

/**
 * 1:1 with `CreateUserSportProfileRequest` (`modules/sport/sport-api`), reused server-side for
 * both create and update. `sportId`/`skillLevel` are `@NotNull` on that DTO even for an update —
 * the service ignores the request's `sportId` there (it re-reads `profile.getSportId()`), but the
 * field still has to be sent to pass bean validation, so this always carries the profile's own,
 * real `sportId`. `bio` is deliberately excluded — not named in this ticket's scope.
 */
export interface UpdateSportProfilePayload {
  sportId: number;
  skillLevel: string;
  yearsOfExperience?: number;
  preferredPosition?: string;
  attributes?: Record<string, unknown>;
}

/** The form's local draft. `skillLevel`/`preferredPosition` are strings bound to inputs;
 * `yearsOfExperience` too (converted back to a number only when sent), same shape
 * `sportFieldsDraft.ts`'s `minPlayers`/`maxPlayers` already use. `attributes` is the flat
 * key -> value map `SportAttributesFields` reads/writes directly — no string conversion, since it
 * is never bound to a plain text input itself. */
export interface SportProfileEditDraft {
  skillLevel: string;
  yearsOfExperience: string;
  preferredPosition: string;
  attributes: Record<string, unknown>;
}

/** Seeds a draft from the server's row. Nulls become `''` so the inputs stay controlled. */
export function toSportProfileEditDraft(profile: UserSportProfileResponse): SportProfileEditDraft {
  return {
    skillLevel: profile.skillLevel ?? '',
    yearsOfExperience: profile.yearsOfExperience?.toString() ?? '',
    preferredPosition: profile.preferredPosition ?? '',
    attributes: profile.attributes ?? {},
  };
}

/**
 * Builds the `PUT /api/sports/profiles/{profileId}` body from only the fields that changed —
 * same `sportFieldsDraft.ts`/`buildUpdatePayload` diff-only precedent this app already uses for
 * every other `UpdateProfileRequest`-shaped partial-update endpoint. `sportId` is always included
 * (see `UpdateSportProfilePayload`'s own comment) — it is not itself diffed since it never
 * changes for an existing profile.
 *
 * `attributes` merges server-side (`UserSportProfileServiceImpl.updateProfile` — an omitted key
 * keeps its stored value, this endpoint can never remove one), so sending it is safe even when
 * nothing in it changed; still gated on a real difference here to avoid a no-op field in the
 * request body on every save.
 *
 * Known limit inherited from the same null-means-skip rule `sportFieldsDraft.ts` documents:
 * `preferredPosition` can be cleared back to `''` (still non-null, reaches the server), but an
 * emptied `yearsOfExperience` is omitted rather than sent as `0` — there is no way to express
 * "unset" for that field either.
 */
export function buildSportProfileUpdatePayload(
  profile: UserSportProfileResponse,
  draft: SportProfileEditDraft,
): UpdateSportProfilePayload {
  const payload: UpdateSportProfilePayload = { sportId: profile.sportId, skillLevel: draft.skillLevel };
  const original = toSportProfileEditDraft(profile);

  if (draft.preferredPosition !== original.preferredPosition) {
    payload.preferredPosition = draft.preferredPosition;
  }
  if (draft.yearsOfExperience !== original.yearsOfExperience && draft.yearsOfExperience !== '') {
    payload.yearsOfExperience = Number(draft.yearsOfExperience);
  }
  if (JSON.stringify(draft.attributes) !== JSON.stringify(original.attributes)) {
    payload.attributes = draft.attributes;
  }

  return payload;
}

/** Whether `draft` differs from `profile`'s saved values in any way that would produce a non-empty
 * payload beyond the always-required `sportId`/`skillLevel` pair — gates the Save button, same
 * `isDirty` precedent `SportFieldsForm`/`EditProfileModal` already use. `skillLevel` is compared
 * directly (not via the diff builder, which always includes it) since it is the one field that is
 * both required and itself capable of being the only change. */
export function isSportProfileDraftDirty(
  profile: UserSportProfileResponse,
  draft: SportProfileEditDraft,
): boolean {
  const original = toSportProfileEditDraft(profile);
  return (
    draft.skillLevel !== original.skillLevel ||
    draft.preferredPosition !== original.preferredPosition ||
    (draft.yearsOfExperience !== original.yearsOfExperience && draft.yearsOfExperience !== '') ||
    JSON.stringify(draft.attributes) !== JSON.stringify(original.attributes)
  );
}

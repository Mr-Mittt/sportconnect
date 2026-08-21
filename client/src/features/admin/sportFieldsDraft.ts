import type { SportResponse } from '@/shared/types/sport';
import type { UpdateSportPayload } from './useUpdateSport';

/** The form's local draft. Every field is a string because it is bound to an input;
 * `minPlayers`/`maxPlayers` are converted back to numbers only when they are sent. */
export interface SportFieldsDraft {
  name: string;
  description: string;
  category: string;
  iconUrl: string;
  minPlayers: string;
  maxPlayers: string;
  isActive: boolean;
}

/** Seeds a draft from the server's row. Nulls become `''` so the inputs stay controlled. */
export function toSportFieldsDraft(sport: SportResponse): SportFieldsDraft {
  return {
    name: sport.name,
    description: sport.description ?? '',
    category: sport.category ?? '',
    iconUrl: sport.iconUrl ?? '',
    minPlayers: sport.minPlayers?.toString() ?? '',
    maxPlayers: sport.maxPlayers?.toString() ?? '',
    isActive: sport.isActive,
  };
}

/**
 * Builds the `PUT /api/sports/{id}` body from only the fields that actually changed.
 *
 * Two reasons this diffs rather than sending the whole draft. First, `updateSport` is
 * null-means-skip server-side (`if (x != null) set(x)`), so sending everything every time
 * would rewrite untouched columns for no reason. Second, it keeps an unrelated concurrent
 * edit from being clobbered by a field this admin never touched.
 *
 * Known limit inherited from that same null-means-skip rule: `description`, `category` and
 * `iconUrl` **cannot be cleared back to `null`** — emptying the input sends `""`, which is
 * the floor. See the ADMIN-2 doc's backend-constraints section.
 *
 * An emptied `minPlayers`/`maxPlayers` is omitted rather than sent: `Number('')` is `0`,
 * which the server's `@Min(1)` would reject, and there is no way to express "unset" here.
 */
export function buildUpdatePayload(
  sport: SportResponse,
  draft: SportFieldsDraft,
): UpdateSportPayload {
  const payload: UpdateSportPayload = {};
  const original = toSportFieldsDraft(sport);

  if (draft.name !== original.name) payload.name = draft.name;
  if (draft.description !== original.description) payload.description = draft.description;
  if (draft.category !== original.category) payload.category = draft.category;
  if (draft.iconUrl !== original.iconUrl) payload.iconUrl = draft.iconUrl;
  if (draft.isActive !== original.isActive) payload.isActive = draft.isActive;

  if (draft.minPlayers !== original.minPlayers && draft.minPlayers !== '') {
    payload.minPlayers = Number(draft.minPlayers);
  }
  if (draft.maxPlayers !== original.maxPlayers && draft.maxPlayers !== '') {
    payload.maxPlayers = Number(draft.maxPlayers);
  }

  return payload;
}

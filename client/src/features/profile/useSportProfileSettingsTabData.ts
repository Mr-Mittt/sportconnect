import { useState } from 'react';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { useSportAttributeSchema } from '@/shared/hooks/useSportAttributeSchema';
import type {
  ResolvedSportAttributeSchema,
  SportKey,
  UserSportProfileResponse,
} from '@/shared/types/sport';
import {
  buildSportProfileUpdatePayload,
  isSportProfileDraftDirty,
  toSportProfileEditDraft,
  type SportProfileEditDraft,
} from './sportProfileEditDraft';
import { useMySportProfilesRaw } from './useMySportProfilesRaw';
import { useProfileActiveSport } from './useProfileActiveSport';
import { useUpdateSportProfile } from './useUpdateSportProfile';

/**
 * The Settings tab's data boundary (PROFILE-4) — resolves the page's active sport
 * (`useProfileActiveSport`) to its `UserSportProfileResponse`, owns the edit draft, and wires
 * `useUpdateSportProfile`. `activeProfile` is `undefined` only for a caller with zero sport
 * profiles (the same edge case `PostsTab` degrades for) — there is no `'all'` state to render an
 * empty state for on this page (PROFILE-4 delta), so that is the only reason this can be
 * `undefined`.
 *
 * **Switching the active sport re-seeds the draft** — whenever `activeProfile.id` changes, the
 * draft resets to that profile's own saved values (below). This hook itself never blocks that
 * switch; `PROFILE-10`'s `ProfilePage` is what intercepts the `SportSwitcher` click *before* it
 * reaches `profilePageStore` at all, via `useUnsavedChangesGuard(isDirty)` — by the time this
 * hook's `activeProfile` actually changes, the guard has already confirmed (Save or Discard) that
 * losing the draft is fine, so this re-seed effect needs no guard logic of its own.
 *
 * `save`'s optional `{ onSuccess }` exists for that same guard — `ProfilePage` calls
 * `save({ onSuccess: proceed })` from the confirm dialog's Save button so the pending
 * tab-switch/sport-switch/navigation only proceeds once the mutation actually succeeds.
 *
 * SPORT-10: `sportKeyOverride` lets `ProfilePage` point the tab at a *deactivated* sport (its
 * muted `SportSwitcher` pill) — the profile list is now read with `includeInactive`, so
 * `activeProfile` may be an `isActive: false` row (the tab renders it read-only with the Active
 * toggle set to Inactive). With no override the tab follows the page's active sport, as before.
 */
export function useSportProfileSettingsTabData(sportKeyOverride?: SportKey): {
  activeProfile: UserSportProfileResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  schema: ResolvedSportAttributeSchema | null;
  isSchemaLoading: boolean;
  draft: SportProfileEditDraft;
  setSkillLevel: (value: string) => void;
  setYearsOfExperience: (value: string) => void;
  setAttribute: (key: string, value: unknown) => void;
  isDirty: boolean;
  save: (options?: { onSuccess?: () => void }) => void;
  /** PROFILE-10: resets `draft` to `activeProfile`'s saved values without
   * requiring `activeProfile.id` to change first — the tab-switch leg of
   * `ProfilePage`'s unsaved-changes guard needs this, since (unlike a sport
   * switch) leaving the Settings tab doesn't touch `activeProfile` at all. */
  discard: () => void;
  isSaving: boolean;
  errorMessage: string | null;
} {
  const { activeSport } = useProfileActiveSport();
  const effectiveSport = sportKeyOverride ?? activeSport;
  const rawProfiles = useMySportProfilesRaw({ includeInactive: true });
  const effectiveSportId = effectiveSport !== undefined ? sportIdForKey(effectiveSport) : undefined;
  // May be an `isActive: false` row (SPORT-10 — the deactivated-pill path); the tab renders
  // it read-only. Only `undefined` for a caller with no profile at all for this sport.
  const activeProfile = rawProfiles.data.find((profile) => profile.sportId === effectiveSportId);

  const schemaQuery = useSportAttributeSchema(activeProfile?.sportId);
  const updateMutation = useUpdateSportProfile();

  const [draft, setDraft] = useState<SportProfileEditDraft>(() =>
    activeProfile !== undefined ? toSportProfileEditDraft(activeProfile) : emptyDraft(),
  );

  // Re-seed whenever the active profile changes (a sport switch, or this profile's own id after a
  // save) — adjusted during render (React's own documented pattern, same as `SportFieldsForm`'s
  // `seededFrom` and `PublicOnlyRoute`'s decision-locking) rather than an effect.
  const [seededFromId, setSeededFromId] = useState(activeProfile?.id);
  if (activeProfile?.id !== seededFromId) {
    setSeededFromId(activeProfile?.id);
    setDraft(activeProfile !== undefined ? toSportProfileEditDraft(activeProfile) : emptyDraft());
  }

  const setSkillLevel = (value: string) => setDraft((current) => ({ ...current, skillLevel: value }));
  const setYearsOfExperience = (value: string) =>
    setDraft((current) => ({ ...current, yearsOfExperience: value }));
  const setAttribute = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));

  const isDirty = activeProfile !== undefined && isSportProfileDraftDirty(activeProfile, draft);

  const save = (options?: { onSuccess?: () => void }) => {
    if (activeProfile === undefined) return;
    const payload = buildSportProfileUpdatePayload(activeProfile, draft);
    updateMutation.updateSportProfile({ profileId: activeProfile.id, payload }, options);
  };

  const discard = () => {
    setDraft(activeProfile !== undefined ? toSportProfileEditDraft(activeProfile) : emptyDraft());
  };

  return {
    activeProfile,
    isLoading: rawProfiles.isLoading,
    isError: rawProfiles.isError,
    schema: schemaQuery.data,
    isSchemaLoading: schemaQuery.isLoading,
    draft,
    setSkillLevel,
    setYearsOfExperience,
    setAttribute,
    isDirty,
    save,
    discard,
    isSaving: updateMutation.isPending,
    errorMessage: updateMutation.errorMessage,
  };
}

function emptyDraft(): SportProfileEditDraft {
  return { skillLevel: '', yearsOfExperience: '', attributes: {} };
}

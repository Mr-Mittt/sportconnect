import { useState } from 'react';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { useSportAttributeSchema } from '@/shared/hooks/useSportAttributeSchema';
import type { ResolvedSportAttributeSchema, UserSportProfileResponse } from '@/shared/types/sport';
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
 * **Switching the active sport silently re-seeds the draft, discarding any unsaved edits to the
 * previous sport — no confirmation dialog.** Same baseline behavior `GRP-2`'s
 * `useSettingsUnsavedGuard` uses when its own `groupId` changes (reset without asking). This tab
 * is built in isolation, before `ProfilePage` (`PROFILE-6`) exists — it reacts to `activeSport`
 * changing, but does not own the `SportSwitcher` instance that changes it, so it cannot intercept
 * the click itself. A page-level "warn before switching away" is `PROFILE-6`'s call to make (it
 * would need to wrap `SportSwitcher`'s `onChange` in a guard that checks this hook's `isDirty`
 * first), not something buildable from inside this isolated component.
 */
export function useSportProfileSettingsTabData(): {
  activeProfile: UserSportProfileResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  schema: ResolvedSportAttributeSchema | null;
  isSchemaLoading: boolean;
  draft: SportProfileEditDraft;
  setSkillLevel: (value: string) => void;
  setYearsOfExperience: (value: string) => void;
  setPreferredPosition: (value: string) => void;
  setAttribute: (key: string, value: unknown) => void;
  isDirty: boolean;
  save: () => void;
  isSaving: boolean;
  errorMessage: string | null;
} {
  const { activeSport } = useProfileActiveSport();
  const rawProfiles = useMySportProfilesRaw();
  const activeSportId = activeSport !== undefined ? sportIdForKey(activeSport) : undefined;
  const activeProfile = rawProfiles.data.find((profile) => profile.sportId === activeSportId);

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
  const setPreferredPosition = (value: string) =>
    setDraft((current) => ({ ...current, preferredPosition: value }));
  const setAttribute = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));

  const isDirty = activeProfile !== undefined && isSportProfileDraftDirty(activeProfile, draft);

  const save = () => {
    if (activeProfile === undefined) return;
    const payload = buildSportProfileUpdatePayload(activeProfile, draft);
    updateMutation.updateSportProfile({ profileId: activeProfile.id, payload });
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
    setPreferredPosition,
    setAttribute,
    isDirty,
    save,
    isSaving: updateMutation.isPending,
    errorMessage: updateMutation.errorMessage,
  };
}

function emptyDraft(): SportProfileEditDraft {
  return { skillLevel: '', yearsOfExperience: '', preferredPosition: '', attributes: {} };
}

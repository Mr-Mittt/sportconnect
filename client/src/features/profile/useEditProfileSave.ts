import { useState } from 'react';
import axios from 'axios';
import type { ApiResponse } from '@/shared/types/api';
import type { EditProfileSavePayload } from '@/shared/components/EditProfileModal';
import { useUpdateMyPreferences } from './useUpdateMyPreferences';
import { useUpdateMyProfile } from './useUpdateMyProfile';

/** Same server-text extraction `useUpdateMyProfile`/`useUpdateMyPreferences` each do for their own
 * `mutation.error` — duplicated here (not imported from either) because this reads a
 * `Promise.allSettled` rejection reason directly. Reading `profile.errorMessage`/
 * `preferences.errorMessage` after the `await` below would be a stale closure: those are computed
 * from each hook's own render-time state, which hasn't re-rendered yet inside this same async
 * function body. */
function extractErrorMessage(reason: unknown, fallback: string): string {
  if (axios.isAxiosError(reason)) {
    const message = (reason.response?.data as ApiResponse<null> | undefined)?.message;
    if (message) return message;
  }
  return fallback;
}

/**
 * CLIENT-REF-3: the combined-Save orchestrator `EditProfileModal`'s one Save button needs —
 * `EditProfileModal` reports a profile-field payload (possibly empty) and an optional
 * `languageCode` (the caller's language preference, a `useUpdateMyPreferences` call, not part of
 * `UpdateProfileRequest`); this hook fires whichever half actually changed and reports **which
 * side failed** distinctly, rather than one generic "could not save" — profile and preferences are
 * two independent endpoints with independent failure modes (e.g. a bad username vs. an inactive
 * language code), and silently conflating them would hide which fields actually need re-editing.
 *
 * Both calls run concurrently (`Promise.allSettled`, not sequential) — there's no ordering
 * dependency between them, and a slow/failing one shouldn't delay the other.
 */
export function useEditProfileSave() {
  const profile = useUpdateMyProfile();
  const preferences = useUpdateMyPreferences();
  const [combinedError, setCombinedError] = useState<string | null>(null);

  async function save(payload: EditProfileSavePayload, options?: { onSuccess?: () => void }) {
    setCombinedError(null);
    const hasProfileChange = Object.keys(payload.profile).length > 0;
    const hasLanguageChange = payload.languageCode !== undefined;

    const [profileResult, preferencesResult] = await Promise.allSettled([
      hasProfileChange ? profile.updateProfileAsync(payload.profile) : Promise.resolve(undefined),
      hasLanguageChange
        ? preferences.updatePreferences({ language: payload.languageCode as string })
        : Promise.resolve(undefined),
    ]);

    const profileFailed = profileResult.status === 'rejected';
    const preferencesFailed = preferencesResult.status === 'rejected';

    if (!profileFailed && !preferencesFailed) {
      options?.onSuccess?.();
      return;
    }

    const profileMessage = profileFailed
      ? extractErrorMessage(profileResult.reason, 'Your profile could not be saved.')
      : null;
    const preferencesMessage = preferencesFailed
      ? extractErrorMessage(preferencesResult.reason, 'Your language preference could not be saved.')
      : null;

    if (profileFailed && preferencesFailed) {
      setCombinedError(`${profileMessage} ${preferencesMessage}`);
    } else if (profileFailed) {
      setCombinedError(
        hasLanguageChange
          ? `${profileMessage} Your language preference was saved.`
          : profileMessage,
      );
    } else {
      setCombinedError(
        hasProfileChange ? `Your profile was saved. ${preferencesMessage}` : preferencesMessage,
      );
    }
  }

  function reset() {
    setCombinedError(null);
    profile.reset();
    preferences.reset();
  }

  return {
    save,
    isSaving: profile.isPending || preferences.isPending,
    errorMessage: combinedError,
    reset,
  };
}

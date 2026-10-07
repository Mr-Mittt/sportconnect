import i18next from 'i18next';
import { useState } from 'react';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { isGeoServerCode } from '@/shared/lib/geoErrors';
import type { AccountSettingsSavePayload } from '@/shared/components/AccountSettingsModal';
import { useUpdateMyPreferences } from './useUpdateMyPreferences';
import { useUpdateMyProfile } from './useUpdateMyProfile';

/** The message for one half of the combined save. Reads a `Promise.allSettled` rejection reason
 * directly: reading `profile.errorMessage`/`preferences.errorMessage` after the `await` below would
 * be a stale closure (those are computed from each hook's own render-time state, which hasn't
 * re-rendered yet inside this async function body). Goes through the shared classifier
 * (CLIENT-ERR-1); `fallback` is only for a failure that is not an HTTP error at all. */
function extractErrorMessage(reason: unknown, fallback: string): string {
  const { category, status } = getApiError(reason);
  if (category === 'UNKNOWN' && status === null) return fallback;
  return getErrorMessage(reason);
}

/**
 * CLIENT-REF-3: the combined-Save orchestrator `AccountSettingsModal`'s one Save button needs —
 * `AccountSettingsModal` reports a profile-field payload (possibly empty) and an optional
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
  const [geoErrorCode, setGeoErrorCode] = useState<string | null>(null);

  async function save(payload: AccountSettingsSavePayload, options?: { onSuccess?: () => void }) {
    setCombinedError(null);
    setGeoErrorCode(null);
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

    // CLIENT-ERR-8: a rejected country / region shows in the geo hint line, not in this message.
    const profileCode = profileFailed ? getApiError(profileResult.reason).code : undefined;
    if (isGeoServerCode(profileCode)) {
      setGeoErrorCode(profileCode);
      const preferencesOnly = preferencesFailed
        ? extractErrorMessage(preferencesResult.reason, i18next.t('profilePage:saveResult.preferencesFailed'))
        : hasLanguageChange
          ? i18next.t('profilePage:saveResult.preferencesSaved')
          : null;
      setCombinedError(preferencesOnly);
      return;
    }

    const profileMessage = profileFailed
      ? extractErrorMessage(profileResult.reason, i18next.t('profilePage:saveResult.profileFailed'))
      : null;
    const preferencesMessage = preferencesFailed
      ? extractErrorMessage(preferencesResult.reason, i18next.t('profilePage:saveResult.preferencesFailed'))
      : null;

    if (profileFailed && preferencesFailed) {
      setCombinedError(`${profileMessage} ${preferencesMessage}`);
    } else if (profileFailed) {
      setCombinedError(
        hasLanguageChange
          ? `${profileMessage} ${i18next.t('profilePage:saveResult.preferencesSaved')}`
          : profileMessage,
      );
    } else {
      setCombinedError(
        hasProfileChange ? `${i18next.t('profilePage:saveResult.profileSaved')} ${preferencesMessage}` : preferencesMessage,
      );
    }
  }

  function reset() {
    setCombinedError(null);
    setGeoErrorCode(null);
    profile.reset();
    preferences.reset();
  }

  return {
    save,
    isSaving: profile.isPending || preferences.isPending,
    errorMessage: combinedError,
    /** CLIENT-ERR-8: the reference code the profile half was rejected with, or `null`. */
    geoErrorCode,
    reset,
  };
}

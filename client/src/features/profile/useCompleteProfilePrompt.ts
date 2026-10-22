import { useCompleteProfileStore } from '@/app/completeProfileStore';
import { useRegions } from '@/shared/hooks/useRegions';
import type { UserResponse } from './types';

/**
 * AUTH-16: whether the "complete your profile" dialog should be open.
 *
 * It opens when the profile has no country, or has a country that has active regions but no region.
 * That is how a value the backend dropped at the first sign-in (A32 ignores an invalid country,
 * region or location instead of failing the sign-in) reaches the user: the profile simply comes
 * back incomplete, with no extra signal from the server. A missing location or language raises
 * nothing — the first is optional, the second always has a default.
 *
 * Stays closed while the profile or the country's region list is still loading (no flash), when the
 * region lookup failed (the dialog could not offer a region anyway), and after the user skipped it
 * in this tab session.
 */
export function useCompleteProfilePrompt(profile: UserResponse | undefined): {
  isOpen: boolean;
  skip: () => void;
} {
  const skippedFor = useCompleteProfileStore((state) => state.skippedFor);
  const skipStore = useCompleteProfileStore((state) => state.skip);
  const regions = useRegions(profile?.countryId ?? null);

  const skip = () => {
    if (profile !== undefined) skipStore(profile.id);
  };

  if (profile === undefined || skippedFor === profile.id) {
    return { isOpen: false, skip };
  }
  if (profile.countryId === null) {
    return { isOpen: true, skip };
  }
  const needsRegion =
    profile.regionId === null && !regions.isLoading && !regions.isError && regions.data.length > 0;
  return { isOpen: needsRegion, skip };
}

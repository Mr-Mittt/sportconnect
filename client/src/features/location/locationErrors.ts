import { getApiError } from '@/shared/lib/apiError';
import { showErrorToast } from '@/shared/lib/errorToast';

/** Stale favorite states (double-click, second tab): the refetch that follows already shows the truth. */
const SILENT_CODES: ReadonlySet<string> = new Set(['LOCATION_ALREADY_FAVORITED', 'LOCATION_NOT_FAVORITED']);

/**
 * CLIENT-ERR-8: how a favorite or unfavorite failure is reported (those hooks set
 * `meta.errorDisplay: 'silent'`, so the global toast never runs). A stale favorite state says
 * nothing; everything else (`LOCATION_NOT_FOUND`, `LOCATION_SPORT_PROFILE_REQUIRED`, network, 5xx)
 * keeps the usual toast.
 */
export function reportLocationMutationError(error: unknown): void {
  const { code } = getApiError(error);
  if (code !== undefined && SILENT_CODES.has(code)) return;
  showErrorToast(error);
}

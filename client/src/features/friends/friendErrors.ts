import { getApiError } from '@/shared/lib/apiError';
import { showErrorToast } from '@/shared/lib/errorToast';

/**
 * Stale friend-request states (double-click, a second tab, the other person acting first): the
 * refetch that `onSettled` already runs shows the true state, so a message would only repeat it.
 */
const SILENT_CODES: ReadonlySet<string> = new Set([
  'ALREADY_FRIENDS',
  'FRIEND_REQUEST_ALREADY_PENDING',
  'FRIEND_REQUEST_NOT_FOUND',
]);

/**
 * CLIENT-ERR-9: how a send / accept / decline / cancel friend-request failure is reported (those
 * hooks set `meta.errorDisplay: 'silent'`, so the global toast never runs). A stale state says
 * nothing; everything else (network, 5xx, ...) keeps the usual toast.
 */
export function reportFriendMutationError(error: unknown): void {
  const { code } = getApiError(error);
  if (code !== undefined && SILENT_CODES.has(code)) return;
  showErrorToast(error);
}

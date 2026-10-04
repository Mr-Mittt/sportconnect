import { toast } from 'sonner';
import { getApiError, getErrorMessage } from './apiError';

/**
 * CLIENT-ERR-1: shows the failure as a toast in the current locale. The message doubles as the
 * toast id, so the same failure fired several times at once (e.g. a burst of rolled-back likes)
 * shows one toast, not a stack. A cancelled request and a 401 never toast: the first is not a
 * failure, the second is owned by the silent-refresh flow in `apiClient.ts`.
 */
export function showErrorToast(error: unknown): void {
  const apiError = getApiError(error);
  if (apiError.canceled || apiError.category === 'UNAUTHENTICATED') return;
  const message = getErrorMessage(error);
  toast.error(message, { id: message });
}

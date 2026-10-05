import i18next from 'i18next';
import { getApiError } from './apiError';

/**
 * CLIENT-ERR-4: the localized text for a failure **only when the server sent a code the client has
 * copy for** (`errors:codes.<CODE>`, `errorParams` interpolated); `undefined` otherwise.
 *
 * Unlike `getErrorMessage`, there is no fallback to server prose or category copy — it is for
 * screens that already have their own static line for "something else went wrong" (the add-sport
 * form, the reactivate and status dialogs) and only want to swap it for a more specific one.
 */
export function getCodedErrorMessage(error: unknown): string | undefined {
  const apiError = getApiError(error);
  if (!apiError.code) return undefined;
  const key = `errors:codes.${apiError.code}`;
  return i18next.exists(key) ? i18next.t(key, apiError.params ?? {}) : undefined;
}

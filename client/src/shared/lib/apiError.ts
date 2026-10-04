import axios from 'axios';
import i18next from 'i18next';

/**
 * CLIENT-ERR-1: the one place the client turns "a request failed" into something it can decide on.
 * Categories are derived from the HTTP status (never sent on the wire); a server `errorCode`
 * (C12, `documentation/md/ERROR_CODES.md`) refines the copy but not the category. Design and the
 * approved per-surface behavior table: `documentation/md/ERROR_HANDLING_DESIGN.md`.
 *
 * `NOT_FOUND` stands for both "not found" and "unavailable" — the client cannot tell a missing
 * resource from an unavailable one by status, and both read the same to the user.
 */
export type ErrorCategory =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NETWORK'
  | 'INTERNAL'
  | 'UNKNOWN';

export interface ApiError {
  category: ErrorCategory;
  /** HTTP status, or `null` when no response arrived (network failure) or the error was not an HTTP one. */
  status: number | null;
  /** Server `errorCode`, when the backend sent one. */
  code?: string;
  /** Server `errorParams` (interpolation values, or `{ fields: {...} }` for validation). */
  params?: Record<string, unknown>;
  /** The server's own text, English only: an envelope's `message`, or a plain-text body (the chat service). */
  message?: string;
  /** True when the request was cancelled client-side — never worth showing to the user. */
  canceled: boolean;
}

function categoryForStatus(status: number): ErrorCategory {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'VALIDATION';
  if (status === 409) return 'CONFLICT';
  if (status >= 500) return 'INTERNAL';
  return 'UNKNOWN';
}

/**
 * Classifies any thrown value. Reads the `ApiResponse` envelope when the body is one (`message`,
 * `errorCode`, `errorParams`), treats a non-empty string body as plain server text (the Go chat
 * service answers with `http.Error` text, not the envelope), and otherwise is status-only. A
 * response-less axios error is `NETWORK`; anything that is not an axios error is `UNKNOWN`.
 */
export function getApiError(error: unknown): ApiError {
  if (axios.isCancel(error)) {
    return { category: 'UNKNOWN', status: null, canceled: true };
  }
  if (!axios.isAxiosError(error)) {
    return { category: 'UNKNOWN', status: null, canceled: false };
  }
  const response = error.response;
  if (!response) {
    return { category: 'NETWORK', status: null, canceled: false };
  }
  const result: ApiError = {
    category: categoryForStatus(response.status),
    status: response.status,
    canceled: false,
  };
  const body: unknown = response.data;
  if (typeof body === 'string') {
    const text = body.trim();
    if (text) result.message = text;
  } else if (typeof body === 'object' && body !== null) {
    const envelope = body as Record<string, unknown>;
    if (typeof envelope.message === 'string' && envelope.message) result.message = envelope.message;
    if (typeof envelope.errorCode === 'string' && envelope.errorCode) result.code = envelope.errorCode;
    if (typeof envelope.errorParams === 'object' && envelope.errorParams !== null) {
      result.params = envelope.errorParams as Record<string, unknown>;
    }
  }
  return result;
}

const PERMANENT: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
]);

/** True for failures that asking again cannot fix (the same request will get the same answer). */
export function isPermanentError(error: unknown): boolean {
  return PERMANENT.has(getApiError(error).category);
}

/**
 * The app-wide default for `QueryClient` `queries.retry`: do not retry a permanent failure
 * (otherwise a deleted post makes the user wait through three backoff attempts before the "no
 * longer exists" state appears), and keep the usual three attempts for `NETWORK`/`INTERNAL`/
 * `UNKNOWN`. A query's own `retry` option still wins over this.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isPermanentError(error)) return false;
  return failureCount < 3;
}

/** Categories whose server text is specific and useful enough to show instead of generic copy. */
const SERVER_TEXT_WINS: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'VALIDATION',
  'CONFLICT',
  'UNAUTHENTICATED',
]);

/**
 * The text to show for a failure, in the current locale. Order:
 * 1. `errors:codes.<CODE>` when the server sent a code the client has copy for (params interpolated);
 * 2. the server's own text for `VALIDATION`/`CONFLICT`/`UNAUTHENTICATED` (e.g. "gender must be one
 *    of: MALE, FEMALE", "Invalid email or password" — more useful than a generic line, English only
 *    until a code exists);
 * 3. the localized category copy (`errors:category.<CATEGORY>`) — always for `FORBIDDEN`,
 *    `NOT_FOUND`, `INTERNAL`, `NETWORK`, so a server string like "An unexpected error occurred"
 *    never shows in Vietnamese.
 *
 * Plain function reading the i18next singleton (like `relativeTime`), so non-component hooks can
 * call it; callers re-evaluate on each render, so a locale switch is picked up.
 */
export function getErrorMessage(error: unknown): string {
  const apiError = getApiError(error);
  if (apiError.code) {
    const key = `errors:codes.${apiError.code}`;
    if (i18next.exists(key)) {
      return i18next.t(key, apiError.params ?? {});
    }
  }
  if (apiError.message && SERVER_TEXT_WINS.has(apiError.category)) {
    return apiError.message;
  }
  return i18next.t(`errors:category.${apiError.category}`);
}

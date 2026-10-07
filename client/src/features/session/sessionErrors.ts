import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessionErrorDialogStore } from '@/app/sessionErrorDialogStore';
import { getApiError } from '@/shared/lib/apiError';
import { showErrorToast } from '@/shared/lib/errorToast';
import { sessionKeys } from './queryKeys';

/**
 * CLIENT-ERR-7: codes that open the error dialog instead of a toast or an inline line. The session
 * modal stays open for these (the refetch after "Got it" shows the true state).
 */
const STAY_OPEN_CODES: ReadonlySet<string> = new Set([
  'SESSION_NOT_FOUND',
  'SESSION_JOIN_REQUEST_NOT_FOUND',
  'SESSION_CANCELLED',
  'SESSION_NOT_CANCELLABLE',
  'SESSION_NOT_PREPARING',
  'SESSION_NOT_PARTICIPANT',
]);

/** Codes that open the dialog and, on "Got it", close the session modal: the user has no right to be in it. */
const CLOSE_CODES: ReadonlySet<string> = new Set([
  'SESSION_FORBIDDEN',
  'SESSION_GROUP_MEMBER_REQUIRED',
  'SESSION_GROUP_ADMIN_REQUIRED',
  'SESSION_CREATOR_REQUIRED',
]);

/** True when this failure is reported with the session error dialog. */
export function isSessionDialogError(error: unknown): boolean {
  const { code } = getApiError(error);
  return code !== undefined && (STAY_OPEN_CODES.has(code) || CLOSE_CODES.has(code));
}

/** True when dismissing this failure's dialog should close the session modal (a 403 code). */
export function isSessionForbiddenDialogError(error: unknown): boolean {
  const { code } = getApiError(error);
  return code !== undefined && CLOSE_CODES.has(code);
}

/**
 * Opens the session error dialog for a session dialog code; returns whether it did, so a hook can
 * fall back to its usual display (toast or inline line) for everything else.
 */
export function reportSessionDialogError(error: unknown): boolean {
  if (!isSessionDialogError(error)) return false;
  useSessionErrorDialogStore.getState().show(error);
  return true;
}

/**
 * How a session mutation that normally toasts reports its failure (its `meta.errorDisplay` is
 * `'silent'`, so the global toast never runs): the dialog for a session dialog code, the usual
 * toast for anything else.
 */
export function reportSessionMutationError(error: unknown): void {
  if (!reportSessionDialogError(error)) showErrorToast(error);
}

/**
 * CLIENT-ERR-7: the app-wide session error dialog's state and dismissal, for `AppShell` to host.
 * Dismissing refetches every session query that is not itself in error (the one that just failed
 * would only fail again and refetches by itself when next opened), so a card or an open modal
 * shows the true state; `error` is the raw failure, localized by the dialog at render.
 */
export function useSessionErrorDialog(): { error: unknown; onDismiss: () => void } {
  const queryClient = useQueryClient();
  const error = useSessionErrorDialogStore((state) => state.error);
  const dismiss = useSessionErrorDialogStore((state) => state.dismiss);
  const onDismiss = () => {
    dismiss(isSessionForbiddenDialogError(error));
    void queryClient.invalidateQueries({
      queryKey: sessionKeys.all,
      predicate: (query) => query.state.status !== 'error',
    });
  };
  return { error, onDismiss };
}

/**
 * CLIENT-ERR-7: wiring for a session detail modal. Active only while a session is open
 * (`sessionId !== null`; several instances of the detail hook are mounted at once, and only the
 * one with a selected session may react): when the dismissed dialog was a 403 the modal closes
 * (the user has no right to be in it). A 409 or 404 leaves the modal open on the refetched data.
 */
export function useSessionErrorGuard(sessionId: number | null, closeDetail: (() => void) | undefined): void {
  const dismissals = useSessionErrorDialogStore((state) => state.dismissals);
  const seenDismissals = useRef(dismissals);
  const closeRef = useRef(closeDetail);
  useEffect(() => {
    closeRef.current = closeDetail;
  });

  useEffect(() => {
    if (dismissals === seenDismissals.current) return;
    seenDismissals.current = dismissals;
    if (sessionId === null) return;
    if (useSessionErrorDialogStore.getState().lastDismissedForbidden) closeRef.current?.();
  }, [dismissals, sessionId]);
}

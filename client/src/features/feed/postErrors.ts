import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePostErrorDialogStore } from '@/app/postErrorDialogStore';
import { getApiError } from '@/shared/lib/apiError';
import { showErrorToast } from '@/shared/lib/errorToast';
import { feedKeys } from './queryKeys';

/** Codes that open the error pop-up instead of a toast (the post is gone, hidden, or not deletable by this user). */
const DIALOG_CODES: ReadonlySet<string> = new Set([
  'POST_NOT_FOUND',
  'POST_FORBIDDEN',
  'POST_DELETE_FORBIDDEN',
]);

/** Codes that need no message: the refetch that follows every failure already shows the true state. */
const SILENT_CODES: ReadonlySet<string> = new Set([
  'POST_ALREADY_LIKED',
  'POST_NOT_LIKED',
  'COMMENT_ALREADY_LIKED',
  'COMMENT_NOT_LIKED',
  'COMMENT_NOT_FOUND',
  'COMMENT_PARENT_NOT_FOUND',
]);

/** True when this failure should be reported with the error pop-up. */
export function isPostDialogError(error: unknown): boolean {
  const { code } = getApiError(error);
  return code !== undefined && DIALOG_CODES.has(code);
}

/**
 * CLIENT-ERR-6: how a post/comment mutation reports its failure (its `meta.errorDisplay` is
 * `'silent'`, so the global toast never runs). Pop-up codes open `PostActionErrorDialog`; codes
 * where the UI already shows the truth after the refetch say nothing; everything else (network,
 * 5xx, `COMMENT_DELETE_FORBIDDEN`, ...) keeps the usual toast.
 */
export function reportPostMutationError(error: unknown): void {
  const { code } = getApiError(error);
  if (code !== undefined && DIALOG_CODES.has(code)) {
    usePostErrorDialogStore.getState().show(error);
  } else if (code === undefined || !SILENT_CODES.has(code)) {
    showErrorToast(error);
  }
}

/**
 * CLIENT-ERR-6: wiring a page that opens the comments modal. A post (or its thread) that fails to
 * load with a pop-up code never shows the modal — the pop-up opens instead (`hideComments`); and
 * whenever the pop-up is dismissed, whichever failure opened it, the page closes the modal and the
 * feed refetches.
 */
export function usePostErrorGuard(
  loadErrors: unknown[],
  closeComments: () => void,
): { hideComments: boolean } {
  const queryClient = useQueryClient();
  const show = usePostErrorDialogStore((state) => state.show);
  const dismissals = usePostErrorDialogStore((state) => state.dismissals);
  const seenDismissals = useRef(dismissals);
  const closeRef = useRef(closeComments);
  useEffect(() => {
    closeRef.current = closeComments;
  });

  const loadDialogError = loadErrors.find((error) => isPostDialogError(error)) ?? null;
  useEffect(() => {
    if (loadDialogError !== null) show(loadDialogError);
  }, [loadDialogError, show]);

  useEffect(() => {
    if (dismissals === seenDismissals.current) return;
    seenDismissals.current = dismissals;
    closeRef.current();
    // Errored queries are skipped: the post/thread that just failed is still mounted for one render
    // and would refetch (and re-open the pop-up); it refetches by itself when next opened.
    void queryClient.invalidateQueries({
      queryKey: feedKeys.all,
      predicate: (query) => query.state.status !== 'error',
    });
  }, [dismissals, queryClient]);

  return { hideComments: loadDialogError !== null };
}

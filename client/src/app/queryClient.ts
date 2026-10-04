import { MutationCache, QueryClient } from '@tanstack/react-query';
import { shouldRetry } from '@/shared/lib/apiError';
import { showErrorToast } from '@/shared/lib/errorToast';

/**
 * CLIENT-ERR-1: how a mutation declares who reports its failure. Default (no `errorDisplay`): the
 * global handler toasts it. A hook that shows its own error next to the form sets `inline`; a
 * background action the user never asked for (mark-as-read) sets `silent`.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { errorDisplay?: 'inline' | 'silent' };
  }
}

/** Exported for tests: the `MutationCache` `onError` — toast unless the mutation opted out. */
export function handleMutationError(
  error: unknown,
  mutationMeta: { errorDisplay?: 'inline' | 'silent' } | undefined,
): void {
  if (mutationMeta?.errorDisplay) return;
  showErrorToast(error);
}

/**
 * The app's `QueryClient`: a category-based default `retry` (no retry for a failure that asking
 * again cannot fix; a query's own `retry` still wins) and a global mutation-failure toast. There is
 * deliberately no `QueryCache` handler: a page query shows its own state, and a background refetch
 * failure leaves the data on screen (approved defaults table, CLIENT-ERR-1).
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handleMutationError(error, mutation.meta);
      },
    }),
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}

import type { PageResponse } from './types';

/**
 * Derives the next Spring Data page number from the previous page's own
 * `last`/`number` fields — never a client-side counter. Shared by every
 * infinite-query hook in this feature (usePersonalFeed, useGroupFeed,
 * usePostsByHashtag) so the pagination contract lives in exactly one place.
 */
export function getNextPageParam<T>(lastPage: PageResponse<T>): number | undefined {
  return lastPage.last ? undefined : lastPage.number + 1;
}

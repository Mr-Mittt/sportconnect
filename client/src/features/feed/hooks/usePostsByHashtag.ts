import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '../pagination';
import { feedKeys } from '../queryKeys';
import type { PagedApiResponse, Post } from '../types';

const PAGE_SIZE = 20;

/**
 * Wraps GET /api/posts/hashtag/{tag} — public endpoint (no auth required
 * server-side), but the client always calls it from an authenticated
 * context today, so results additionally include the caller's own
 * GROUP_POSTs.
 *
 * `tag` is accepted WITH the leading '#', matching PostCard/TrendingHashtags'
 * existing hashtag-click callback convention (`onHashtagClick('#tournament')`)
 * — this hook strips it before calling the real endpoint, since the backend
 * stores/matches tags without '#' (verified against a live backend,
 * 2026-07-13: `HashtagServiceImpl`'s extraction regex captures the tag body
 * only, and `PostServiceImpl.getPostsByHashtag` does no further stripping —
 * an unstripped '#' would silently never match).
 *
 * **This endpoint currently 500s for every input, `#`-prefixed or not** —
 * verified against a live backend (2026-07-13): `PostHashtagRepository
 * .findPostsByHashtag`'s custom `@Query` has its own static `ORDER BY
 * ph.post.lastInteractionAt`, and the controller's `@PageableDefault(sort =
 * "lastInteractionAt")` makes Spring Data JPA also append a *second*,
 * dynamically-generated `ORDER BY ph.lastInteractionAt` directly against the
 * query's root entity (`PostHashtag`), which has no such field — every call
 * throws `UnknownPathException` before returning. **Fixed 2026-07-14** —
 * see `modules/social/post-impl/docs/A10_FIX_HASHTAG_ENDPOINT_500.md` — no
 * longer blocking.
 *
 * `enabled` (default `true`) gates the fetch, same reasoning as
 * `useComments(postId, enabled)`: FEED-6's `useHashtagResultsData` calls this
 * hook unconditionally (React's rules of hooks), so it must not fetch until
 * a tag is actually selected (the hashtag-results modal is open).
 */
export function usePostsByHashtag(tag: string, enabled = true) {
  const normalizedTag = tag.replace(/^#/, '');
  return useInfiniteQuery({
    queryKey: feedKeys.hashtagPosts(normalizedTag),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Post>>(
        `/posts/hashtag/${encodeURIComponent(normalizedTag)}`,
        { params: { page: pageParam, size: PAGE_SIZE } },
      );
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled,
  });
}

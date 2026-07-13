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
 * throws `UnknownPathException` before returning. Filed as a blocking
 * backend bug: `modules/social/post-impl/docs/BACKLOG_MVP.md`. This hook is
 * typed and wired correctly against the documented contract, but cannot be
 * exercised end-to-end until that bug is fixed — FEED-6 (which wires
 * hashtag click-through into the UI) must confirm the fix has shipped
 * before relying on this hook actually returning data.
 */
export function usePostsByHashtag(tag: string) {
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
  });
}

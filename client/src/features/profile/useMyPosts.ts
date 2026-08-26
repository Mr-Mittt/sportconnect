import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { PagedApiResponse, Post } from '@/features/feed/types';
import { profileKeys } from './queryKeys';

const PAGE_SIZE = 20;

/**
 * Wraps `GET /api/posts/mine` (paginated) — the caller's own posts, for the
 * `/profile` Posts tab. Same native `useInfiniteQuery` shape as
 * `usePersonalFeed`/`useGroupFeed` (`{ data, isLoading, isError,
 * fetchNextPage, hasNextPage, ... }`), no custom wrapping.
 *
 * Named `useMyPosts` rather than `useUserPosts(userId)` (PROFILE-0's
 * original spec) — verified against the real `PostController` at pickup:
 * there is no `GET /api/posts/user/{userId}`, only `/posts/mine`, which
 * derives the caller from the auth principal and takes no id param. This
 * matches the page's own "own profile only" scope (`PROFILE_PAGE_DESIGN.md`
 * §1) exactly, so no arbitrary-user variant is needed here.
 *
 * `profileKeys.myPosts()` is built off `feedKeys.all` (PROFILE-2 correction)
 * so `useLikePost`/`useUnlikePost`/`useDeletePost`'s existing cache updates
 * reach this bucket automatically — see `queryKeys.ts`'s comment for why.
 */
export function useMyPosts() {
  return useInfiniteQuery({
    queryKey: profileKeys.myPosts(),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Post>>('/posts/mine', {
        params: { page: pageParam, size: PAGE_SIZE },
      });
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
  });
}

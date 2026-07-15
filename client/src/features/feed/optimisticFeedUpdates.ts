import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { feedKeys } from './queryKeys';
import type { PageResponse, Post } from './types';

type FeedInfiniteData = InfiniteData<PageResponse<Post>>;

// The second segment of every feedKeys.* key that actually holds Post-shaped
// InfiniteData (personalFeed/groupFeed/hashtagPosts). Every other feedKeys.*
// entry (comments, userGroups, publicGroups, joinRequests, ...) shares the
// same `['feed', ...]` prefix but holds a different shape — either a plain
// Page<T> (no `.pages`, would throw if treated as InfiniteData) or, for
// `comments`, InfiniteData<PageResponse<Comment>>. Comment also has `id`/
// `likeCount`/`isLikedByCurrentUser` fields (both Post and Comment use their
// own independent `GenerationType.IDENTITY` column, so a Post id and a
// Comment id routinely collide numerically), so matching on the whole
// `feed` prefix wouldn't just risk a crash — it'd risk silently flipping
// like-state on, or deleting, a same-numbered comment instead of the post.
const POST_FEED_TAGS: ReadonlySet<string> = new Set(['personal', 'group', 'hashtag']);

function isPostFeedQueryKey(queryKey: QueryKey): boolean {
  return queryKey[0] === feedKeys.all[0] && typeof queryKey[1] === 'string' && POST_FEED_TAGS.has(queryKey[1]);
}

/**
 * Runtime discriminator between a real `Post` and a same-shaped-enough
 * `Comment` (both carry `id`/`likeCount`/`isLikedByCurrentUser`) — only
 * `Post` carries `postType`. `isPostFeedQueryKey` above is what actually
 * prevents a Comment from reaching this code today; this is defense-in-depth
 * so a future re-broadening of that predicate degrades to a no-op skip
 * instead of silently mistransforming a same-numbered comment again.
 */
function isPost(item: { id: number }): item is Post {
  return 'postType' in item;
}

/**
 * Applies `transformPost` to every cached page of every currently-mounted
 * Post-feed query (personalFeed, groupFeed, hashtagPosts), returning postId
 * unchanged if not found on that page. Used by useLikePost/useUnlikePost's
 * optimistic onMutate so a like flip is reflected in whichever feed view(s)
 * currently have this post rendered, without needing to know which specific
 * feed is mounted. Deliberately narrower than `feedKeys.all` — see
 * `isPostFeedQueryKey`'s comment for why matching that whole prefix is unsafe.
 */
export function updatePostInFeedCaches(
  queryClient: QueryClient,
  postId: number,
  transformPost: (post: Post) => Post,
): void {
  queryClient.setQueriesData<FeedInfiniteData>(
    { predicate: (query) => isPostFeedQueryKey(query.queryKey) },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          content: page.content.map((post) =>
            post.id === postId && isPost(post) ? transformPost(post) : post,
          ),
        })),
      };
    },
  );
}

/**
 * Removes postId from every cached page of every Post-feed query.
 * Used by useDeletePost's optimistic onMutate — the acceptance criterion is
 * "removes it from the visible list without a full refetch", so this splices
 * the cache directly rather than waiting on invalidate+refetch. Same
 * Post-feed-only scoping as updatePostInFeedCaches above, and for the same
 * reason.
 */
export function removePostFromFeedCaches(queryClient: QueryClient, postId: number): void {
  queryClient.setQueriesData<FeedInfiniteData>(
    { predicate: (query) => isPostFeedQueryKey(query.queryKey) },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          content: page.content.filter((post) => !(post.id === postId && isPost(post))),
          numberOfElements: page.content.filter((post) => !(post.id === postId && isPost(post)))
            .length,
        })),
      };
    },
  );
}

/**
 * Prepends `post` to the first cached page of one specific feed-shaped query
 * (unlike updatePostInFeedCaches/removePostFromFeedCaches, which touch every
 * mounted feed query — a newly created post belongs to exactly one feed:
 * personalFeed for a USER_FEED post, groupFeed(groupId) for a GROUP_POST).
 * No-ops if that query has no cached data yet (nothing mounted to update).
 * Used by useCreatePost's onSuccess so the acceptance criterion ("prepend
 * without a full refetch") holds even though — unlike the like/delete
 * mutations — there's nothing to do optimistically in onMutate: the real
 * post (id, createdAt, etc.) only exists once the server responds.
 */
export function prependPostToFeedCache(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  post: Post,
): void {
  queryClient.setQueryData<FeedInfiniteData>(queryKey, (data) => {
    if (!data) return data;
    const [firstPage, ...restPages] = data.pages;
    return {
      ...data,
      pages: [
        {
          ...firstPage,
          content: [post, ...firstPage.content],
          numberOfElements: firstPage.numberOfElements + 1,
          totalElements: firstPage.totalElements + 1,
        },
        ...restPages,
      ],
    };
  });
}

/** Snapshot of every feed-shaped query's cached data, for rollback on mutation error. */
export function snapshotFeedCaches(queryClient: QueryClient): [readonly unknown[], unknown][] {
  return queryClient.getQueriesData({ queryKey: feedKeys.all });
}

/** Restores a snapshot taken by snapshotFeedCaches — used in onError. */
export function restoreFeedCaches(
  queryClient: QueryClient,
  snapshot: [readonly unknown[], unknown][],
): void {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}

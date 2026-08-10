import type { Post } from '../../src/features/feed/types.ts';
import { mockGroup, mockPost } from './fixtures.ts';

/**
 * FEED-10 step 1: 21 posts — one more than usePersonalFeed's fixed page
 * size — so "load more" has a genuine second page to fetch, rather than
 * every existing spec's 3-post fixture (which always fits on page 0). Two
 * posts are special-cased and reused by later journey steps rather than
 * adding yet more separate fixture arrays:
 *  - index 19 (last post on page 0) is a GROUP_POST for mockGroup — step 5's
 *    "switch to a group's feed" target.
 *  - index 20 (only reachable via "Load more", page 1) is Pickleball, not
 *    Badminton like the rest — proves sport-filtering narrows against posts
 *    loaded from *either* page, not just the first.
 *
 * MSW-1: moved from paginatedFeed.ts (retired) — pure fixture construction,
 * called by the mock server's `/__mock/sessions/:id/seed-paginated-feed`
 * admin route (mockServer.ts) instead of a browser-side dynamic import.
 */
export function buildPaginatedFeed(): Post[] {
  return Array.from({ length: 21 }, (_, index) => {
    const isGroupPost = index === 19;
    const isPickleball = index === 20;
    return {
      ...mockPost,
      id: 1000 + index,
      content: isPickleball
        ? 'Pickup game this weekend #paginationcheck'
        : isGroupPost
          ? "Who's in for Friday training? #paginationcheck"
          : `Post number ${index + 1} #paginationcheck`,
      hashtags: ['paginationcheck'],
      postType: isGroupPost ? 'GROUP_POST' : 'USER_FEED',
      groupId: isGroupPost ? mockGroup.id : null,
      sportId: isPickleball ? 3 : 1,
      createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    };
  });
}

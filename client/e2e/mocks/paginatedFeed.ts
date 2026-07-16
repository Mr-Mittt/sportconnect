import type { Post } from '../../src/features/feed/types.ts';
import { mockGroup, mockPost } from './fixtures.ts';
import { seedPostsState } from './handlers/feed.ts';

// FEED-10 step 1: 21 posts — one more than usePersonalFeed's fixed page
// size — so "load more" has a genuine second page to fetch, rather than
// every existing spec's 3-post fixture (which always fits on page 0). Two
// posts are special-cased and reused by later journey steps rather than
// adding yet more separate fixture arrays:
//  - index 19 (last post on page 0) is a GROUP_POST for mockGroup — step 5's
//    "switch to a group's feed" target.
//  - index 20 (only reachable via "Load more", page 1) is Basketball, not
//    Soccer like the rest — proves sport-filtering narrows against posts
//    loaded from *either* page, not just the first.
function buildPaginatedFeed(): Post[] {
  return Array.from({ length: 21 }, (_, index) => {
    const isGroupPost = index === 19;
    const isBasketball = index === 20;
    return {
      ...mockPost,
      id: 1000 + index,
      content: isBasketball
        ? 'Pickup game this weekend #paginationcheck'
        : isGroupPost
          ? "Who's in for Friday training? #paginationcheck"
          : `Post number ${index + 1} #paginationcheck`,
      hashtags: ['paginationcheck'],
      postType: isGroupPost ? 'GROUP_POST' : 'USER_FEED',
      groupId: isGroupPost ? mockGroup.id : null,
      sportId: isBasketball ? 6 : 5,
      sportName: isBasketball ? 'Basketball' : 'Soccer',
      createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    };
  });
}

/**
 * Seeds feed.ts's shared postsState with 21 posts before the app's first
 * fetch — reached via fixtures.ts's seedPaginatedFeedOnNextLoad, same
 * addInitScript mechanism as emptyFeed.ts's overrideFeedToEmpty. Unlike that
 * one, this doesn't register a new handler: it replaces the *data* the
 * existing `/posts/feed` handler (now genuinely page-aware, see feed.ts's
 * pagedFeedResponse) already serves, so like/unlike/comment/create against
 * these posts keep working through feed.ts's own unmodified handlers.
 */
export function seedPaginatedFeed(): void {
  seedPostsState(buildPaginatedFeed());
}

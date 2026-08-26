import { feedKeys } from '@/features/feed/queryKeys';

// Single source of truth for this feature's TanStack Query keys — same
// convention as feedKeys/friendKeys.
export const profileKeys = {
  all: ['profile'] as const,
  myProfile: (userId: string) => [...profileKeys.all, 'me', userId] as const,
  // Built off feedKeys.all, not profileKeys.all (PROFILE-2 correction) —
  // this holds Post-shaped data, and useLikePost/useUnlikePost/useDeletePost
  // only reach buckets whose key starts with 'feed' and is tagged in
  // optimisticFeedUpdates.ts's POST_FEED_TAGS ('my-posts' added there too).
  // A key under 'profile' would be invisible to all three — see PROFILE-2's
  // implementation summary for the full trace. No userId param — /posts/mine
  // derives the caller from the auth principal, so there's only ever one
  // "my posts" cache entry at a time.
  myPosts: () => [...feedKeys.all, 'my-posts'] as const,
};

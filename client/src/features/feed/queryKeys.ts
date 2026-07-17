// Single source of truth for this feature's TanStack Query keys. Mutations
// invalidate via `feedKeys.all` (blunt but simple) rather than enumerating
// every specific key they might affect — FEED-1 layers true optimistic
// updates with targeted cache writes on top of this where it matters
// (e.g. the like/unlike flip), this file only needs to get every mounted
// feed-related query to refetch.
export const feedKeys = {
  all: ['feed'] as const,
  personalFeed: () => [...feedKeys.all, 'personal'] as const,
  groupFeed: (groupId: number) => [...feedKeys.all, 'group', groupId] as const,
  hashtagPosts: (tag: string) => [...feedKeys.all, 'hashtag', tag] as const,
  trendingHashtags: () => [...feedKeys.all, 'trending-hashtags'] as const,
  broadcasts: () => [...feedKeys.all, 'broadcasts'] as const,
  userGroups: (userId: string) => [...feedKeys.all, 'user-groups', userId] as const,
  comments: (postId: number) => [...feedKeys.all, 'comments', postId] as const,
  post: (postId: number) => [...feedKeys.all, 'post', postId] as const,
  publicGroups: (sportId: number | undefined, keyword: string) =>
    [...feedKeys.all, 'public-groups', sportId ?? 'any', keyword] as const,
  joinRequests: (userId: string) => [...feedKeys.all, 'join-requests', userId] as const,
};

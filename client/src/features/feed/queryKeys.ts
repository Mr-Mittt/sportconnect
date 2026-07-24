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
  publicGroups: (sportIds: number[] | undefined, keyword: string) =>
    [...feedKeys.all, 'public-groups', sportIds ?? 'any', keyword] as const,
  joinRequests: (userId: string) => [...feedKeys.all, 'join-requests', userId] as const,
  groupSettings: (groupId: number) => [...feedKeys.all, 'group-settings', groupId] as const,
  groupInfo: (groupId: number) => [...feedKeys.all, 'group-info', groupId] as const,
  groupMembers: (groupId: number) => [...feedKeys.all, 'group-members', groupId] as const,
  groupJoinRequests: (groupId: number) => [...feedKeys.all, 'group-join-requests', groupId] as const,
  sentInvitations: (groupId: number) => [...feedKeys.all, 'sent-invitations', groupId] as const,
  // GRP-7: the owner/admin's pending_owner approval queue for a group.
  groupInvitations: (groupId: number) => [...feedKeys.all, 'group-invitations', groupId] as const,
  // GRP-7: the invitee's own pending_user invitations across every group.
  userPendingInvitations: (userId: string) =>
    [...feedKeys.all, 'user-pending-invitations', userId] as const,
};

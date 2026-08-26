// Single source of truth for this feature's TanStack Query keys — same
// convention as feedKeys/friendKeys.
export const profileKeys = {
  all: ['profile'] as const,
  myProfile: (userId: string) => [...profileKeys.all, 'me', userId] as const,
  // No userId param — /posts/mine derives the caller from the auth
  // principal, so there's only ever one "my posts" cache entry at a time.
  myPosts: () => [...profileKeys.all, 'my-posts'] as const,
};

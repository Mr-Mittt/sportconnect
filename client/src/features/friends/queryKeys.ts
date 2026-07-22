// Single source of truth for this feature's TanStack Query keys — same
// blunt-invalidation convention as feedKeys (mutations invalidate
// friendKeys.all rather than enumerating every specific key they touch).
export const friendKeys = {
  all: ['friends'] as const,
  list: () => [...friendKeys.all, 'list'] as const,
  requestsReceived: () => [...friendKeys.all, 'requests-received'] as const,
  requestsSent: () => [...friendKeys.all, 'requests-sent'] as const,
  search: (keyword: string) => [...friendKeys.all, 'search', keyword] as const,
  profile: (userId: string) => [...friendKeys.all, 'profile', userId] as const,
};

// Single source of truth for this feature's TanStack Query keys — same
// blunt-invalidation convention as friendKeys/feedKeys.
export const chatKeys = {
  all: ['chat'] as const,
  conversation: {
    group: (groupId: number) => [...chatKeys.all, 'conversation', 'group', groupId] as const,
    direct: (userId: string) => [...chatKeys.all, 'conversation', 'direct', userId] as const,
  },
  messages: (conversationId: number) => [...chatKeys.all, 'messages', conversationId] as const,
};

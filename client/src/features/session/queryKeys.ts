// Single source of truth for this feature's TanStack Query keys — same shape as feedKeys/locationKeys.
export const sessionKeys = {
  all: ['session'] as const,
  group: (groupId: number) => [...sessionKeys.all, 'group', groupId] as const,
  mine: () => [...sessionKeys.all, 'mine'] as const,
  detail: (sessionId: number) => [...sessionKeys.all, 'detail', sessionId] as const,
  participants: (sessionId: number) => [...sessionKeys.all, 'participants', sessionId] as const,
};

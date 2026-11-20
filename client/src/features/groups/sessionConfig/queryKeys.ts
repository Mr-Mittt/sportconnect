// CLIENT-GROUP-SESSION-4: the query keys of a group's regular-session configuration (same shape as feedKeys/sessionKeys).
export const sessionConfigKeys = {
  all: ['group-session-config'] as const,
  settings: (groupId: number) => [...sessionConfigKeys.all, 'settings', groupId] as const,
  recurrences: (groupId: number) => [...sessionConfigKeys.all, 'recurrences', groupId] as const,
};

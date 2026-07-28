export interface TypingUser {
  userId: string;
  displayName: string;
}

/**
 * Formats the "who's typing" line shared by GroupChatTabView and
 * FriendChatPanelView. A 1:1 DM only ever has one other participant, so it
 * always hits the single-name branch in practice, but the logic is identical
 * to group chat's, so it's one shared function rather than two copies.
 */
export function formatTypingLabel(users: TypingUser[]): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return `${users[0].displayName} is typing…`;
  if (users.length === 2) return `${users[0].displayName} and ${users[1].displayName} are typing…`;
  return `${users.length} people are typing…`;
}

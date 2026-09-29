import i18next from 'i18next';

export interface TypingUser {
  userId: string;
  displayName: string;
}

/**
 * Formats the "who's typing" line shared by GroupChatTabView and
 * FriendChatPanelView. A 1:1 DM only ever has one other participant, so it
 * always hits the single-name branch in practice, but the logic is identical
 * to group chat's, so it's one shared function rather than two copies.
 *
 * CLIENT-I18N-7: reads the i18next singleton directly (`common:typing.*`) like `relativeTime` — a plain
 * function, not a component. Translated for both callers at once, so the Friends page (CLIENT-I18N-8)
 * inherits the typing line already done.
 */
export function formatTypingLabel(users: TypingUser[]): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return i18next.t('common:typing.one', { name: users[0].displayName });
  if (users.length === 2) return i18next.t('common:typing.two', { first: users[0].displayName, second: users[1].displayName });
  return i18next.t('common:typing.many', { count: users.length });
}

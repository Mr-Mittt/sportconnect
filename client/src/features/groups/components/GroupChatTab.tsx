import { useGroupChatData } from '@/features/chat/useGroupChatData';
import { GroupChatTabView } from './GroupChatTabView';

interface GroupChatTabProps {
  groupId: number;
  currentUserId: string;
  /** Extra classes for the chat window's root (CLIENT-GROUP-UI-1: the page lets it shrink below its usual minimum when it shares its box with the session shortcut). */
  className?: string;
}

/**
 * GRP-1's Chat tab, wired to the real chat service (CHAT-8) — thin
 * container that calls `useGroupChatData` and hands its result to
 * `GroupChatTabView` (the presentational half). `GroupsPage` only mounts
 * this component while the Chat tab is active and keys it per selected
 * group — that mount/unmount is what drives `useGroupChatData`'s WebSocket
 * connect/disconnect lifecycle.
 */
export function GroupChatTab({ groupId, currentUserId, className }: GroupChatTabProps) {
  const { data: messages, ...chatData } = useGroupChatData(groupId);
  return <GroupChatTabView currentUserId={currentUserId} messages={messages} className={className} {...chatData} />;
}

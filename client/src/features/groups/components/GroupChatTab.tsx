import { useGroupChatData } from '@/features/chat/useGroupChatData';
import { GroupChatTabView } from './GroupChatTabView';

interface GroupChatTabProps {
  groupId: number;
  currentUserId: string;
}

/**
 * GRP-1's Chat tab, wired to the real chat service (CHAT-8) — thin
 * container that calls `useGroupChatData` and hands its result to
 * `GroupChatTabView` (the presentational half). `GroupsPage` only mounts
 * this component while the Chat tab is active and keys it per selected
 * group — that mount/unmount is what drives `useGroupChatData`'s WebSocket
 * connect/disconnect lifecycle.
 */
export function GroupChatTab({ groupId, currentUserId }: GroupChatTabProps) {
  const { data: messages, ...chatData } = useGroupChatData(groupId);
  return <GroupChatTabView currentUserId={currentUserId} messages={messages} {...chatData} />;
}

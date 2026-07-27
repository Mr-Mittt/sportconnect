import { useDirectChatData } from '@/features/chat/useDirectChatData';
import { FriendChatPanelView } from './FriendChatPanelView';

interface FriendChatPanelProps {
  /** The other person's id — opens (or resumes) the 1:1 conversation with them. */
  userId: string;
  currentUserId: string;
}

/**
 * FRIEND-1's chat panel, wired to the real chat service (CHAT-9) — thin
 * container that calls `useDirectChatData` and hands its result to
 * `FriendChatPanelView` (the presentational half). `FriendsPage` only
 * mounts this component while a person is selected and keys it per
 * selection — that mount/unmount is what drives `useDirectChatData`'s
 * WebSocket connect/disconnect lifecycle.
 */
export function FriendChatPanel({ userId, currentUserId }: FriendChatPanelProps) {
  const { data: messages, ...chatData } = useDirectChatData(userId);
  return <FriendChatPanelView currentUserId={currentUserId} messages={messages} {...chatData} />;
}

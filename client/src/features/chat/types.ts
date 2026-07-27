// Typed 1:1 against services/chat/README.md §7 (the chat service's own
// documented response shapes) — this is a separate backend from the Spring
// monolith, so nothing here is wrapped in the shared ApiResponse<T> envelope
// (modules/common's convention) the way every other feature's types are.

export type ConversationType = 'GROUP' | 'DIRECT';

// Response shape of POST /conversations/open/group/{groupId} and
// POST /conversations/open/direct/{userId} — externalGroupId is only present
// on a GROUP conversation.
export interface Conversation {
  id: number;
  type: ConversationType;
  externalGroupId: number | null;
  createdAt: string;
}

// Response shape of POST /conversations/{id}/messages and each element of
// GET /conversations/{id}/messages's array, and the exact JSON frame pushed
// over the WebSocket for a new message.
export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: string;
  senderFullName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

// Not part of the backend contract — local-only state describing the
// WebSocket connection's lifecycle, exposed by useChatConversation so a
// consuming component (CHAT-8/9) can render a "reconnecting…" affordance if
// it chooses to.
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

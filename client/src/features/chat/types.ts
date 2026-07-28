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

// Response shape of POST /conversations/{id}/messages, PATCH/DELETE
// .../messages/{messageId}, and each element of GET .../messages's array.
// editedAt/deletedAt (CHAT-13) are both null for a message that's never
// been touched. A deleted message's `content` always comes back empty —
// scrubbed server-side (services/chat/internal/message.Repository.Delete) —
// so render the "deleted" placeholder from `deletedAt` alone, never from
// `content` being falsy.
export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: string;
  senderFullName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

// CHAT-15's typing payload — never persisted, only ever relayed live.
// displayName is resolved server-side the same way ChatMessage's
// senderFullName is (never taken from client input).
export interface TypingEventPayload {
  conversationId: number;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

// The exact JSON frame pushed over the WebSocket. MESSAGE_CREATED/EDITED/
// DELETED (CHAT-13) tell the client whether `message` is brand new (append)
// or an edit/delete to something already rendered (find-and-replace in
// place). USER_TYPING (CHAT-15) is a sibling variant with an unrelated
// `typing` payload, not a fourth message-shaped event — see
// services/chat/internal/api's wsEvent/wsTypingEvent split.
export type ChatWebSocketEvent =
  | { type: 'MESSAGE_CREATED' | 'MESSAGE_EDITED' | 'MESSAGE_DELETED'; message: ChatMessage }
  | { type: 'USER_TYPING'; typing: TypingEventPayload };

// Not part of the backend contract — local-only state describing the
// WebSocket connection's lifecycle, exposed by useChatConversation so a
// consuming component (CHAT-8/9) can render a "reconnecting…" affordance if
// it chooses to.
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

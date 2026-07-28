import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ChatMessage, Conversation } from '../../../src/features/chat/types.ts';
import { mockUser } from '../fixtures.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

// Chat is a separate backend (services/chat, Go + Postgres) from the Spring
// monolith — these routes are registered bare (no '/api/chat' prefix), the
// same shape the real Go router uses (internal/api/router.go). vite.config.ts's
// '/api/chat' proxy strips the prefix before forwarding, and playwright.config.ts
// points VITE_CHAT_PROXY_TARGET at this same mock server for e2e runs, so a
// request that left the browser as e.g. POST /api/chat/conversations/open/group/1
// arrives here as POST /conversations/open/group/1. Responses are raw JSON,
// never wrapped in the monolith's ApiResponse<T> — chat's types.ts documents
// this as a deliberate difference from every other feature's handlers.

function apiError(message: string): { success: false; message: string; data: null } {
  return { success: false, message, data: null };
}

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

interface ChatConversationState {
  conversation: Conversation;
  // Newest-first, matching the real backend's keyset-pagination order
  // (services/chat/internal/message.Repository.Page) — GET .../messages and
  // this handler's own `before` cursor filtering both rely on that order.
  messages: ChatMessage[];
}

interface ChatSession {
  conversationsByKey: Map<string, ChatConversationState>;
  nextConversationId: number;
  nextMessageId: number;
}

function defaultChatSession(): ChatSession {
  return {
    conversationsByKey: new Map(),
    nextConversationId: 90001,
    nextMessageId: 500001,
  };
}

const chatSessions = createSessionStore(defaultChatSession);

function getOrCreateConversation(
  session: ChatSession,
  key: string,
  type: Conversation['type'],
  externalGroupId: number | null,
): ChatConversationState {
  const existing = session.conversationsByKey.get(key);
  if (existing) return existing;
  const created: ChatConversationState = {
    conversation: {
      id: session.nextConversationId++,
      type,
      externalGroupId,
      createdAt: new Date().toISOString(),
    },
    messages: [],
  };
  session.conversationsByKey.set(key, created);
  return created;
}

function findConversationById(session: ChatSession, id: number): ChatConversationState | undefined {
  for (const state of session.conversationsByKey.values()) {
    if (state.conversation.id === id) return state;
  }
  return undefined;
}

export const chatHandlers: HttpHandler[] = [
  http.post('/conversations/open/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = getOrCreateConversation(session, `group:${groupId}`, 'GROUP', groupId);
    return HttpResponse.json(state.conversation);
  }),

  http.post('/conversations/open/direct/:userId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const userId = String(params.userId);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = getOrCreateConversation(session, `direct:${userId}`, 'DIRECT', null);
    return HttpResponse.json(state.conversation);
  }),

  http.get('/conversations/:id/messages', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const conversationId = Number(params.id);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = findConversationById(session, conversationId);
    if (!state) return HttpResponse.json(apiError('Conversation not found'), { status: 404 });

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const before = url.searchParams.get('before');
    const pool = before
      ? state.messages.filter((m) => m.id < Number(before))
      : state.messages;
    return HttpResponse.json(pool.slice(0, limit));
  }),

  http.post('/conversations/:id/messages', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const conversationId = Number(params.id);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = findConversationById(session, conversationId);
    if (!state) return HttpResponse.json(apiError('Conversation not found'), { status: 404 });

    const { content } = (await request.json()) as { content: string };
    const message: ChatMessage = {
      id: session.nextMessageId++,
      conversationId,
      senderId: mockUser.id,
      senderFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      senderAvatarUrl: null,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
    };
    state.messages = [message, ...state.messages];
    return HttpResponse.json(message, { status: 201 });
  }),

  http.patch('/conversations/:id/messages/:messageId', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const conversationId = Number(params.id);
    const messageId = Number(params.messageId);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = findConversationById(session, conversationId);
    if (!state) return HttpResponse.json(apiError('Conversation not found'), { status: 404 });
    const existing = state.messages.find((m) => m.id === messageId);
    if (!existing) return HttpResponse.json(apiError('Message not found'), { status: 404 });

    const { content } = (await request.json()) as { content: string };
    const updated: ChatMessage = { ...existing, content, editedAt: new Date().toISOString() };
    state.messages = state.messages.map((m) => (m.id === messageId ? updated : m));
    return HttpResponse.json(updated);
  }),

  http.delete('/conversations/:id/messages/:messageId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const conversationId = Number(params.id);
    const messageId = Number(params.messageId);
    const session = chatSessions.get(sessionIdFromRequest(request));
    const state = findConversationById(session, conversationId);
    if (!state) return HttpResponse.json(apiError('Conversation not found'), { status: 404 });
    const existing = state.messages.find((m) => m.id === messageId);
    if (!existing) return HttpResponse.json(apiError('Message not found'), { status: 404 });

    // Soft-delete, content scrubbed server-side (services/chat/internal/message.Repository.Delete)
    // — a deleted message's original text is never re-served, same as the real backend.
    const updated: ChatMessage = { ...existing, content: '', deletedAt: new Date().toISOString() };
    state.messages = state.messages.map((m) => (m.id === messageId ? updated : m));
    return HttpResponse.json(updated);
  }),

  http.post('/conversations/:id/typing', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    // Ephemeral, relay-only on the real backend (CHAT-15) — nothing to
    // persist. E2E simulates an incoming typing event over the fake
    // WebSocket (fakeChatSocket.ts) rather than round-tripping this call
    // back out to another connection, since there's no second real client
    // in these tests.
    return HttpResponse.json({ acknowledged: true });
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetChatHandlersState(sessionId: string): void {
  chatSessions.reset(sessionId);
}

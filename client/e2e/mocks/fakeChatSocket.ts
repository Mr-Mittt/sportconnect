import type { Page } from '@playwright/test';
import type { ChatWebSocketEvent } from '../../src/features/chat/types.ts';

/**
 * CHAT-10's resolution to the WS-vs-MSW gap (client/CLAUDE.md's testing
 * convention only ever anticipated REST): the chat client (useChatConversation.ts)
 * only ever *receives* over its WebSocket — every mutation (send/edit/delete/
 * typing) is plain REST — so a fake, in-page WebSocket that never touches the
 * network is a complete substitute, not a partial one. Call
 * `installFakeChatSocket(page)` before `seedAuthenticatedSession` in any spec
 * that opens a chat surface; it overrides `window.WebSocket` for that page via
 * `addInitScript` (reinstalled automatically on every navigation/reload, same
 * as a real app reconnecting). `pushChatEvent` then simulates a server push
 * (a message from someone else arriving, a typing signal) without a second
 * real client or any WebSocket support in the mock server itself.
 *
 * String-form addInitScript/evaluate, not typed function callbacks — this
 * repo's e2e tsconfig has no DOM lib (see a11y.spec.ts's same workaround), so
 * `window`/`Event`/`MessageEvent` don't resolve as TypeScript types here even
 * though this code only ever runs in a real browser.
 */
const INIT_SCRIPT = `
(() => {
  class FakeChatWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      const match = url.match(/\\/conversations\\/(\\d+)\\/ws/);
      if (match) {
        FakeChatWebSocket.registry.set(Number(match[1]), this);
      }
      // Matches a real WebSocket's async handshake — onopen never fires
      // synchronously in the constructor.
      setTimeout(() => {
        this.readyState = 1;
        if (this.onopen) this.onopen(new Event('open'));
      }, 0);
    }

    // The app never sends a frame over this socket — every mutation goes
    // through chatApiClient (REST) instead, see useChatConversation.ts — so
    // a no-op is the correct fake, not a stub standing in for missing
    // behavior.
    send() {}

    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose(new Event('close'));
    }

    addEventListener() {}
    removeEventListener() {}
  }
  FakeChatWebSocket.registry = new Map();

  window.__FakeChatWebSocket = FakeChatWebSocket;
  window.WebSocket = FakeChatWebSocket;
})();
`;

export async function installFakeChatSocket(page: Page): Promise<void> {
  await page.addInitScript(INIT_SCRIPT);
}

/**
 * Simulates a server-pushed WebSocket frame (a real backend push, per the
 * `{type, message}`/`{type, typing}` envelope CHAT-13/CHAT-15 defined) on the
 * conversation currently registered under `conversationId`. No-ops if no
 * socket has (yet) connected for that conversation.
 */
export async function pushChatEvent(
  page: Page,
  conversationId: number,
  event: ChatWebSocketEvent,
): Promise<void> {
  const conversationIdJson = JSON.stringify(conversationId);
  const eventJson = JSON.stringify(event);
  await page.evaluate(`
    (() => {
      const registry = window.__FakeChatWebSocket && window.__FakeChatWebSocket.registry;
      const socket = registry && registry.get(${conversationIdJson});
      if (socket && socket.onmessage) {
        socket.onmessage({ data: ${JSON.stringify(eventJson)} });
      }
    })();
  `);
}

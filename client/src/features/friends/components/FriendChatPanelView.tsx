import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/features/chat/types';
import { useInfiniteScrollSentinel } from '@/shared/lib/useInfiniteScrollSentinel';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export interface FriendChatPanelViewProps {
  /** The signed-in user's id — flags their own messages for the
   * right-aligned/accent bubble style; the other person's messages show
   * their `senderFullName` (resolved server-side, see `useDirectChatData`). */
  currentUserId: string;
  messages: ChatMessage[] | undefined;
  isLoading: boolean;
  isError: boolean;
  sendMessage: (content: string) => void;
  isSending: boolean;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  isLoadOlderMessagesError: boolean;
  loadOlderMessages: () => void;
}

/**
 * Presentational half of FRIEND-1's chat panel (CHAT-9) — everything visual
 * and controlled, no data fetching of its own. Split out from
 * `FriendChatPanel` (the thin container that calls `useDirectChatData`) for
 * the same reason `GroupChatTab`/`GroupChatTabView` were split at CHAT-8:
 * `useDirectChatData` owns a real WebSocket tied to mount/unmount, which the
 * container, not this view, needs to be the thing that mounts/unmounts.
 * `Couldn't load this conversation.` covers both a real loading failure and
 * the friends-only gate (`conversation.ErrNotFriends`, a 403) — the backend
 * already enforces who can chat with whom; this view just needs to fail
 * cleanly, not distinguish the reason.
 */
export function FriendChatPanelView({
  currentUserId,
  messages,
  isLoading,
  isError,
  sendMessage,
  isSending,
  hasOlderMessages,
  isLoadingOlderMessages,
  isLoadOlderMessagesError,
  loadOlderMessages,
}: FriendChatPanelViewProps) {
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number | null>(null);
  const previousOldestIdRef = useRef<number | null>(null);
  const previousNewestIdRef = useRef<number | null>(null);

  const canLoadOlder = hasOlderMessages && !isLoadingOlderMessages;
  const sentinelRef = useInfiniteScrollSentinel(loadOlderMessages, canLoadOlder);

  const handleLoadOlderMessages = () => {
    if (containerRef.current) {
      previousScrollHeightRef.current = containerRef.current.scrollHeight;
    }
    loadOlderMessages();
  };

  // Same scroll-anchoring behavior as GroupChatTabView (CHAT-8): initial
  // load and a brand-new message jump to the bottom; prepending an older
  // page preserves the exact scroll offset instead. Only button/sentinel-
  // triggered behavior is asserted in tests; exact pixel scroll behavior
  // needs a real browser (jsdom reports 0 for scrollHeight).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !messages) return;

    const oldestId = messages[0]?.id ?? null;
    const newestId = messages.at(-1)?.id ?? null;
    const isInitialLoad = previousNewestIdRef.current === null && newestId !== null;
    const isPrepend =
      previousOldestIdRef.current !== null &&
      oldestId !== previousOldestIdRef.current &&
      newestId === previousNewestIdRef.current;
    const isNewMessage = previousNewestIdRef.current !== null && newestId !== previousNewestIdRef.current;

    if (isInitialLoad || isNewMessage) {
      container.scrollTop = container.scrollHeight;
    } else if (isPrepend && previousScrollHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - previousScrollHeightRef.current;
    }

    previousOldestIdRef.current = oldestId;
    previousNewestIdRef.current = newestId;
    previousScrollHeightRef.current = null;
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage(text);
    setDraft('');
  };

  const inputDisabled = isLoading || isError;

  return (
    <div className="flex h-full flex-col">
      <div className="border-hairline flex flex-1 flex-col overflow-hidden rounded-xl border-border bg-surface-2">
        <div ref={containerRef} className="flex-1 overflow-y-auto p-3.5">
          {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
          {isError && (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't load this conversation.
            </p>
          )}
          {!isLoading && !isError && (
            <>
              <div ref={sentinelRef} aria-hidden="true" />
              {hasOlderMessages && isLoadOlderMessagesError && (
                <div className="mb-2.5 flex flex-col items-center gap-1.5">
                  <p className="text-2xs text-text-danger">Couldn't load earlier messages.</p>
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    className="cursor-pointer rounded-lg border-hairline border-border px-3 py-1 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                  >
                    Retry
                  </button>
                </div>
              )}
              {hasOlderMessages && !isLoadOlderMessagesError && (
                <button
                  type="button"
                  onClick={handleLoadOlderMessages}
                  disabled={isLoadingOlderMessages}
                  className="mb-2.5 w-full cursor-pointer rounded-lg border-hairline border-border py-1 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
                >
                  {isLoadingOlderMessages ? 'Loading…' : 'Load earlier messages'}
                </button>
              )}
              {(messages?.length ?? 0) === 0 ? (
                <p className="text-2sm text-text-muted">No messages yet.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {(messages ?? []).map((message) => {
                    const isOwn = message.senderId === currentUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-2.75 py-1.75 text-2sm ${
                            isOwn ? 'bg-bg-accent text-text-primary' : 'bg-surface-1 text-text-primary'
                          }`}
                        >
                          {!isOwn && (
                            <div className="mb-0.5 text-2xs font-medium text-text-primary">
                              {message.senderFullName}
                            </div>
                          )}
                          {message.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-hairline-t flex gap-2 border-border p-2.5">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send();
            }}
            placeholder="Message…"
            aria-label="Message"
            disabled={inputDisabled}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={send}
            disabled={draft.trim().length === 0 || isSending || inputDisabled}
          >
            {isSending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/features/chat/types';
import { formatTypingLabel, type TypingUser } from '@/features/chat/typingLabel';
import { useAutoResizeTextarea } from '@/shared/lib/useAutoResizeTextarea';
import { useInfiniteScrollSentinel } from '@/shared/lib/useInfiniteScrollSentinel';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';

// How long after the last keystroke before a "stopped typing" signal is sent
// automatically (CHAT-15, user decision) — client-driven, no server timer.
const TYPING_STOP_DELAY_MS = 5000;

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export interface GroupChatTabViewProps {
  /** The signed-in user's id — flags their own messages for the
   * accent bubble style and the edit/delete affordance (sender-only,
   * CHAT-13); every other sender's messages show their `senderFullName`
   * and avatar (resolved server-side, see `useGroupChatData`). */
  currentUserId: string;
  messages: ChatMessage[] | undefined;
  isLoading: boolean;
  isError: boolean;
  sendMessage: (content: string) => void;
  isSending: boolean;
  editMessage: (messageId: number, content: string) => void;
  isEditing: boolean;
  deleteMessage: (messageId: number) => void;
  isDeleting: boolean;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  isLoadOlderMessagesError: boolean;
  loadOlderMessages: () => void;
  /** Other group members currently typing (CHAT-15). */
  typingUsers: TypingUser[];
  sendTyping: (isTyping: boolean) => void;
}

/**
 * Presentational half of GRP-1's Chat tab (CHAT-8, edit/delete + layout
 * added CHAT-13) — everything visual and controlled, no data fetching of
 * its own. Split out from `GroupChatTab` (the thin container that calls
 * `useGroupChatData`) so this component can be driven entirely by plain
 * props in Storybook/tests, the same way every other tab in this app
 * already works (e.g. `GroupMembersTab`) — the container split exists only
 * because `useGroupChatData` owns a real WebSocket tied to mount/unmount,
 * which the container, not this view, needs to be the thing that
 * mounts/unmounts.
 *
 * CHAT-13 layout: own messages align left, other members' align right (a
 * deliberate reversal of the usual own-on-right convention, user decision)
 * — an avatar shows for other members' messages only, not the caller's own.
 */
export function GroupChatTabView({
  currentUserId,
  messages,
  isLoading,
  isError,
  sendMessage,
  isSending,
  editMessage,
  isEditing,
  deleteMessage,
  isDeleting,
  hasOlderMessages,
  isLoadingOlderMessages,
  isLoadOlderMessagesError,
  loadOlderMessages,
  typingUsers,
  sendTyping,
}: GroupChatTabViewProps) {
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const composeTextareaRef = useAutoResizeTextarea(draft);
  const editTextareaRef = useAutoResizeTextarea(editDraft);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number | null>(null);
  const previousOldestIdRef = useRef<number | null>(null);
  const previousNewestIdRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sends TYPING_START once per idle→typing transition (not on every
  // keystroke) and restarts a 5s idle timer that sends TYPING_STOP — the
  // client-driven debounce, per CHAT-15's design decision.
  const notifyTyping = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(false);
    }, TYPING_STOP_DELAY_MS);
  };

  const stopTypingNow = () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(false);
    }
  };

  // Signal a stop on unmount (switching tabs/groups) rather than leaving the
  // other side's indicator to expire only via its own timeout.
  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTyping(false);
      }
    };
  }, [sendTyping]);

  const canLoadOlder = hasOlderMessages && !isLoadingOlderMessages;
  const sentinelRef = useInfiniteScrollSentinel(loadOlderMessages, canLoadOlder);

  const handleLoadOlderMessages = () => {
    if (containerRef.current) {
      previousScrollHeightRef.current = containerRef.current.scrollHeight;
    }
    loadOlderMessages();
  };

  // Keeps the transcript's scroll position sane across three distinct
  // updates to `messages`: the initial load and a brand-new message both
  // jump to the bottom (the thing you want to see just arrived); prepending
  // an older page (via loadOlderMessages) instead preserves the exact
  // scroll offset so the view doesn't jump out from under the reader — the
  // classic "load more at the top" scroll-anchoring problem. Only
  // button/sentinel-triggered behavior is asserted in tests; exact pixel
  // scroll behavior needs a real browser (jsdom reports 0 for scrollHeight).
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
    const isNewMessage =
      previousNewestIdRef.current !== null && newestId !== previousNewestIdRef.current;

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
    stopTypingNow();
  };

  const startEditing = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const saveEdit = () => {
    const text = editDraft.trim();
    if (!text || editingMessageId === null) return;
    editMessage(editingMessageId, text);
    setEditingMessageId(null);
    setEditDraft('');
  };

  const inputDisabled = isLoading || isError;
  const typingLabel = formatTypingLabel(typingUsers.filter((u) => u.userId !== currentUserId));

  return (
    <div className="flex h-105 flex-col">
      <div className="border-hairline flex flex-1 flex-col overflow-hidden rounded-xl border-border bg-surface-2">
        <div ref={containerRef} className="flex-1 overflow-y-auto p-3.5">
          {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
          {isError && (
            <p role="alert" className="text-2sm text-text-danger">
              Couldn't load this group's chat.
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
                  {(() => {
                    const messageList = messages ?? [];
                    return messageList.map((message, index) => {
                      const isOwn = message.senderId === currentUserId;
                      const isDeleted = message.deletedAt !== null;
                      const isEditingThis = editingMessageId === message.id;
                      // Avatar only on the last message of a consecutive run from
                      // the same sender (chronologically — messages render
                      // oldest-to-newest top-to-bottom, so "last" is the next
                      // message down) — a spacer of the same size keeps the
                      // bubble's left edge aligned for the earlier messages in
                      // that run instead of them shifting over.
                      const isLastOfConsecutiveRun =
                        index === messageList.length - 1 ||
                        messageList[index + 1].senderId !== message.senderId;

                      return (
                        <div
                          key={message.id}
                          className={`group flex flex-col ${isOwn ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`flex items-end gap-1.5 ${isOwn ? 'flex-row' : 'flex-row-reverse'}`}
                          >
                            {!isOwn && isLastOfConsecutiveRun && (
                              <Avatar className="mb-0.5 size-6 shrink-0">
                                {message.senderAvatarUrl !== null && (
                                  <AvatarImage src={message.senderAvatarUrl} alt="" />
                                )}
                                <AvatarFallback className="text-2xs">
                                  {initialsFor(message.senderFullName)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            {!isOwn && !isLastOfConsecutiveRun && (
                              <div className="size-6 shrink-0" aria-hidden="true" />
                            )}
                            <div
                              className={`relative break-words rounded-lg px-2.75 py-1.75 text-2sm ${
                                isEditingThis ? 'w-[24rem]' : 'max-w-sm'
                              } ${
                                isOwn
                                  ? 'bg-bg-accent text-text-primary'
                                  : 'bg-surface-1 text-text-primary'
                              }`}
                            >
                              {isEditingThis ? (
                                <div className="flex flex-col gap-1.5">
                                  <Textarea
                                    ref={editTextareaRef}
                                    value={editDraft}
                                    onChange={(event) => setEditDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        saveEdit();
                                      }
                                      if (event.key === 'Escape') cancelEditing();
                                    }}
                                    rows={1}
                                    className="min-h-0 resize-none py-1.5 text-2sm"
                                    aria-label="Edit message content"
                                  />
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={saveEdit}
                                      disabled={editDraft.trim().length === 0}
                                      className="cursor-pointer text-2xs font-medium text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditing}
                                      className="cursor-pointer text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {!isOwn && (
                                    <div className="mb-0.5 text-2xs font-medium text-text-primary">
                                      {message.senderFullName}
                                    </div>
                                  )}
                                  {isDeleted ? (
                                    <span className="italic text-text-muted">Message deleted</span>
                                  ) : (
                                    <>
                                      {message.content}
                                      {message.editedAt !== null && (
                                        <span className="ml-1 text-2xs text-text-muted">
                                          (edited)
                                        </span>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                              {isOwn && !isDeleted && !isEditingThis && (
                                <div className="absolute -bottom-2.5 right-1 z-10 flex gap-0.5 rounded-full border-hairline border-border bg-surface-2 px-1 py-0.5 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => startEditing(message)}
                                    disabled={isEditing || isDeleting}
                                    aria-label="Edit message"
                                    className="cursor-pointer rounded p-0.5 text-text-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
                                  >
                                    <IconPencil className="size-3" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMessage(message.id)}
                                    disabled={isEditing || isDeleting}
                                    aria-label="Delete message"
                                    className="cursor-pointer rounded p-0.5 text-text-muted hover:text-text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
                                  >
                                    <IconTrash className="size-3" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}
        </div>
        {typingLabel && (
          <p className="px-3.5 pb-1 text-2xs text-text-muted" aria-live="polite">
            {typingLabel}
          </p>
        )}
        <div className="border-hairline-t flex items-end gap-2 border-border p-2.5">
          <Textarea
            ref={composeTextareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              notifyTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            onBlur={stopTypingNow}
            placeholder="Message the group…"
            aria-label="Message the group"
            disabled={inputDisabled}
            rows={1}
            className="min-h-0 resize-none py-2"
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

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatApiClient, buildChatWebSocketUrl } from './chatApiClient';
import { chatKeys } from './queryKeys';
import type { ChatMessage, ChatWebSocketEvent, ConnectionStatus, Conversation } from './types';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MESSAGES_PAGE_SIZE = 50;

type MessagesPage = ChatMessage[];
type MessagesData = InfiniteData<MessagesPage, number | undefined>;

interface UseChatConversationResult {
  data: ChatMessage[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  sendMessage: (content: string) => void;
  isSending: boolean;
  editMessage: (messageId: number, content: string) => void;
  isEditing: boolean;
  deleteMessage: (messageId: number) => void;
  isDeleting: boolean;
  connectionStatus: ConnectionStatus;
  /** Whether an older page of history exists beyond what's currently loaded. */
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  isLoadOlderMessagesError: boolean;
  /** Fetches the next (older) page of history — a no-op if none remains or one is already in flight. */
  loadOlderMessages: () => void;
}

/**
 * Shared implementation behind useGroupChatData/useDirectChatData — the two
 * only differ in which "open" endpoint they call and what query key they use
 * (a group id vs a friend's user id), everything else (history, sending,
 * the WebSocket lifecycle) is identical.
 *
 * Flow: open (or resume) the conversation, then fetch its most recent page
 * of history once the conversation id is known (older pages fetched
 * on-demand via loadOlderMessages), then open a WebSocket for real-time push.
 * Sent messages and WS-pushed messages both funnel through the same
 * id-deduped merge into the TanStack Query cache — the backend broadcasts a
 * sent message to every connection on the conversation including the
 * sender's own (see services/chat/README.md §6.4), so the REST response and
 * the WS push can both deliver the same message.
 */
export function useChatConversation(
  conversationQueryKey: readonly unknown[],
  openConversation: () => Promise<Conversation>,
): UseChatConversationResult {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  const conversationQuery = useQuery({
    queryKey: conversationQueryKey,
    queryFn: openConversation,
    retry: false, // a 403 (not a member / not friends) is terminal, not transient
    staleTime: Infinity, // opening is idempotent server-side — nothing to re-derive once known
  });

  const conversationId = conversationQuery.data?.id;

  const messagesQuery = useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId ?? -1),
    queryFn: async ({ pageParam }: { pageParam: number | undefined }): Promise<MessagesPage> => {
      const params =
        pageParam === undefined
          ? { limit: MESSAGES_PAGE_SIZE }
          : { before: pageParam, limit: MESSAGES_PAGE_SIZE };
      const response = await chatApiClient.get<ChatMessage[]>(
        `/conversations/${conversationId}/messages`,
        { params },
      );
      return response.data; // newest-first, per the backend's keyset pagination (README.md §7)
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length < MESSAGES_PAGE_SIZE ? undefined : lastPage.at(-1)?.id,
    enabled: conversationId !== undefined,
  });

  // Pages are fetched newest-page-first (page 0 = latest 50, page 1 = the 50
  // before that, ...), each individually newest-first (the backend's own
  // order). Reversing page order, then reversing each page's contents,
  // yields one oldest-to-newest transcript for a top-to-bottom render.
  const messages = useMemo(
    () => messagesQuery.data?.pages.slice().reverse().flatMap((page) => [...page].reverse()),
    [messagesQuery.data],
  );

  const mergeMessage = useCallback(
    (incoming: ChatMessage) => {
      if (conversationId === undefined) return;
      queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (prev) => {
        if (!prev || prev.pages.length === 0) {
          return { pages: [[incoming]], pageParams: [undefined] };
        }
        const latestPage = prev.pages[0];
        if (latestPage.some((message) => message.id === incoming.id)) return prev;
        return { ...prev, pages: [[incoming, ...latestPage], ...prev.pages.slice(1)] };
      });
    },
    [conversationId, queryClient],
  );

  // Edits/deletes never change which page a message lives on (unlike a new
  // message, which always belongs on the latest page) — find it by id
  // across every loaded page and replace it in place.
  const replaceMessage = useCallback(
    (updated: ChatMessage) => {
      if (conversationId === undefined) return;
      queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => page.map((m) => (m.id === updated.id ? updated : m))),
        };
      });
    },
    [conversationId, queryClient],
  );

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (conversationId === undefined) {
        throw new Error('Cannot send a message before the conversation has opened');
      }
      const response = await chatApiClient.post<ChatMessage>(`/conversations/${conversationId}/messages`, {
        content,
      });
      return response.data;
    },
    onSuccess: mergeMessage,
  });

  const editMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: number; content: string }) => {
      if (conversationId === undefined) {
        throw new Error('Cannot edit a message before the conversation has opened');
      }
      const response = await chatApiClient.patch<ChatMessage>(
        `/conversations/${conversationId}/messages/${messageId}`,
        { content },
      );
      return response.data;
    },
    onSuccess: replaceMessage,
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: number) => {
      if (conversationId === undefined) {
        throw new Error('Cannot delete a message before the conversation has opened');
      }
      const response = await chatApiClient.delete<ChatMessage>(
        `/conversations/${conversationId}/messages/${messageId}`,
      );
      return response.data;
    },
    onSuccess: replaceMessage,
  });

  // Ref-held (not state) so the cleanup function below always reaches the
  // latest socket/timer without needing to re-run the effect on every render.
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_DELAY_MS);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (conversationId === undefined) return undefined;

    unmountedRef.current = false;
    reconnectDelayRef.current = RECONNECT_BASE_DELAY_MS;

    const connect = (isReconnect: boolean) => {
      if (unmountedRef.current) return;
      setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

      const socket = new WebSocket(buildChatWebSocketUrl(conversationId));
      socketRef.current = socket;

      // Every handler below checks it's still the current connection
      // (socketRef.current === socket) before doing anything — not just
      // unmountedRef. React 18 StrictMode double-invokes this effect in dev
      // (mount → cleanup → mount), and unmountedRef is a single ref shared
      // across both invocations: the second mount resets it to false before
      // the first (torn-down) socket's async onclose has fired, so that
      // stale onclose would otherwise see itself as still "mounted" and
      // incorrectly kick off a reconnect — including an onopen-triggered
      // queryClient.invalidateQueries call that could race a just-sent
      // message into the cache, making it look like it vanished. Comparing
      // socket identity instead makes a torn-down or superseded socket's
      // callbacks no-ops regardless of which ref reset when.
      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        setConnectionStatus('open');
        reconnectDelayRef.current = RECONNECT_BASE_DELAY_MS;
        if (isReconnect) {
          // Fill any gap in the most recent page missed while disconnected.
          void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
        }
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (socketRef.current !== socket) return;
        try {
          const wsEvent = JSON.parse(event.data) as ChatWebSocketEvent;
          if (wsEvent.type === 'MESSAGE_CREATED') {
            mergeMessage(wsEvent.message);
          } else {
            replaceMessage(wsEvent.message);
          }
        } catch {
          // Malformed frame — ignore rather than tear down the connection.
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (unmountedRef.current) return;
        setConnectionStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(() => connect(true), reconnectDelayRef.current);
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_DELAY_MS);
      };
    };

    connect(false);

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionStatus('closed');
    };
  }, [conversationId, mergeMessage, replaceMessage, queryClient]);

  return {
    data: messages,
    isLoading: conversationQuery.isLoading || messagesQuery.isLoading,
    isError: conversationQuery.isError || messagesQuery.isError,
    error: conversationQuery.error ?? messagesQuery.error,
    sendMessage: (content: string) => sendMutation.mutate(content),
    isSending: sendMutation.isPending,
    editMessage: (messageId: number, content: string) => editMutation.mutate({ messageId, content }),
    isEditing: editMutation.isPending,
    deleteMessage: (messageId: number) => deleteMutation.mutate(messageId),
    isDeleting: deleteMutation.isPending,
    connectionStatus,
    hasOlderMessages: messagesQuery.hasNextPage,
    isLoadingOlderMessages: messagesQuery.isFetchingNextPage,
    isLoadOlderMessagesError: messagesQuery.isFetchNextPageError,
    loadOlderMessages: () => {
      void messagesQuery.fetchNextPage();
    },
  };
}

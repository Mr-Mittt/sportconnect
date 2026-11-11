import { useQueryClient } from '@tanstack/react-query';
import { Client, ReconnectionTimeMode, type IMessage } from '@stomp/stompjs';
import { useEffect } from 'react';
import { isDefiniteRefusal, refreshSession } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { unreadNotificationCountQueryKey } from './useUnreadNotificationCount';
import type { NotificationLiveUpdate } from './types';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * NTF-3: opens a STOMP-over-WebSocket connection to `/ws` and subscribes to
 * `/user/queue/notifications` for live-delivered notification pings, scoped
 * deliberately to *web, in-app, connected-session* delivery — see
 * `documentation/md/vision/NOTIFICATION_MODULE_VISION.md`'s hybrid-delivery
 * decision for why this isn't, and isn't meant to become, a mobile solution.
 *
 * The ping already carries the fresh unread count (NTF-3's "lightweight ping"
 * payload decision), so this writes it straight into the query cache via
 * `setQueryData` rather than invalidating and re-fetching — one fewer round
 * trip for the one piece of data every ping already contains.
 *
 * Token handling (CLIENT-NOTIF-6): `@stomp/stompjs` reconnects on its own after a drop or a refused
 * CONNECT, so the token is read from the auth store on *every* connect attempt (`beforeConnect`),
 * never frozen at mount. A refused CONNECT (typically an expired access token) marks the next attempt
 * to refresh first, through the same shared `refreshSession()` REST uses, so concurrent refreshes
 * make one call and a lost race can never sign the user out. A definite refusal (the session is
 * over) stops the socket; anything else (backend or network down) keeps retrying with exponential
 * backoff. CLIENT-NOTIF-1 still owns the reconnect UX and the poll fallback.
 */
export function useNotificationLiveSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Set when the server refuses a CONNECT: the next attempt refreshes the token before connecting.
    let refreshBeforeNextConnect = false;

    const client = new Client({
      brokerURL: `${protocol}://${window.location.host}/ws`,
      reconnectDelay: RECONNECT_DELAY_MS,
      maxReconnectDelay: MAX_RECONNECT_DELAY_MS,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      beforeConnect: async () => {
        if (refreshBeforeNextConnect) {
          refreshBeforeNextConnect = false;
          try {
            await refreshSession();
          } catch (error) {
            if (isDefiniteRefusal(error)) {
              void client.deactivate(); // session over (already cleared): stop reconnecting
              return;
            }
            // backend or network down: say nothing about the session, keep retrying with backoff
          }
        }
        const currentToken = useAuthStore.getState().accessToken;
        if (!currentToken) {
          void client.deactivate(); // signed out meanwhile
          return;
        }
        client.connectHeaders = { Authorization: `Bearer ${currentToken}` };
      },
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (message: IMessage) => {
          const payload = JSON.parse(message.body) as NotificationLiveUpdate;
          queryClient.setQueryData(unreadNotificationCountQueryKey, payload.unreadCount);
        });
      },
      onStompError: (frame) => {
        // A refused CONNECT (e.g. an expired token): refresh before the library's next attempt.
        refreshBeforeNextConnect = true;
        console.error('[notifications] STOMP error', frame.headers.message);
      },
    });

    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [queryClient]);
}

import { useQueryClient } from '@tanstack/react-query';
import { Client, type IMessage } from '@stomp/stompjs';
import { useEffect } from 'react';
import { useAuthStore } from '@/app/authStore';
import { unreadNotificationCountQueryKey } from './useUnreadNotificationCount';
import type { NotificationLiveUpdate } from './types';

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
 * Deliberately minimal, matching NTF-3's confirmed scope (backend + a minimal
 * client subscription, not the full bell/dropdown UI): no reconnect/backoff
 * logic — a dropped connection just stops receiving live pings until the next
 * page load, no different from `@stomp/stompjs`'s own default
 * (`reconnectDelay` unset = no auto-reconnect). CLIENT-NOTIF-1 owns the real
 * reconnect UX and the poll fallback its own spec already calls for.
 */
export function useNotificationLiveSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const client = new Client({
      brokerURL: `${protocol}://${window.location.host}/ws`,
      connectHeaders: { Authorization: `Bearer ${accessToken}` },
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (message: IMessage) => {
          const payload = JSON.parse(message.body) as NotificationLiveUpdate;
          queryClient.setQueryData(unreadNotificationCountQueryKey, payload.unreadCount);
        });
      },
      onStompError: (frame) => {
        // No retry/backoff here by design (see Javadoc above) — just make a
        // rejected CONNECT (e.g. an expired token) visible instead of silent.
        console.error('[notifications] STOMP error', frame.headers.message);
      },
    });

    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [queryClient]);
}

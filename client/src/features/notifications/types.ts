// 1:1 with the backend's NotificationLiveUpdateMessage (modules/notification's
// push package) — the STOMP ping payload, deliberately lightweight (NTF-3).
export interface NotificationLiveUpdate {
  notificationId: number;
  unreadCount: number;
}

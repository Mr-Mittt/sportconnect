// 1:1 with the backend's NotificationLiveUpdateMessage (modules/notification's
// push package) — the STOMP ping payload, deliberately lightweight (NTF-3).
export interface NotificationLiveUpdate {
  notificationId: number;
  unreadCount: number;
}

// 1:1 with NTF-4's NotificationActorSummary — the bounded (<=3) actor list
// resolved to a display name server-side (no client-side user lookup).
export interface NotificationActorSummary {
  id: string;
  fullName: string;
}

// 1:1 with NotificationResponse (modules/notification's notification-api),
// including NTF-4's actors/entityTitle enrichment. entityType/entityId stay
// untyped strings, same as the backend entity — this module has no
// cross-domain concept of what a "SESSION" or "USER" id looks like beyond
// the string it's given.
//
// Every member is a routing key the backend actually emits: the session.*
// keys from SessionEventsConsumer (NTF-2), the user.friend_request.* keys
// from UserEventsConsumer (U13). Adding a member here forces a
// getNotificationText case for it (CLIENT-NOTIF-4's exhaustiveness guard).
export type NotificationType =
  | 'session.comment.created'
  | 'session.participant.joined'
  | 'session.participant.left'
  | 'session.status.started'
  | 'session.join_request.created'
  | 'session.join_request.approved'
  | 'session.join_request.rejected'
  | 'session.invitation.created'
  | 'user.friend_request.created'
  | 'user.friend_request.accepted';

export interface Notification {
  id: number;
  type: NotificationType;
  entityType: string;
  entityId: string;
  actorIds: string[];
  actorCount: number;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  actors: NotificationActorSummary[];
  entityTitle: string | null;
}

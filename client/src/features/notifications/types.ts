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
  // SESSION-66 / CLIENT-SESSION-49: a friend shared a session with the user.
  | 'session.share.created'
  // SESSION-GROUP-1 / CLIENT-GROUP-SESSION-3: a group session was created (or generated) for the user, or one they were told about or
  // joined was cancelled. Both carry the session id and the actor and no group id.
  | 'session.group.created'
  | 'session.group.cancelled'
  // SESSION-24 / CLIENT-SESSION-21: fired on every successful updateSession call, regardless of
  // which field changed — field-agnostic by design, hence the generic text below.
  | 'session.details.updated'
  // SESSION-GL-63 / CLIENT-GL-51: a result was changed in a session the user takes part in.
  | 'session.record.changed'
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
  // NTF-8 / CLIENT-NOTIF-7: a short text some notifications carry (<= 500 characters, user content,
  // shown as written). Today only `session.join_request.rejected` has one: the host's reason for
  // declining. Null (or absent from an older server) means no text.
  message?: string | null;
}

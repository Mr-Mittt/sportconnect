import type { Notification } from './types';

export interface NotificationTextSegment {
  text: string;
  /** Bold only the actor name(s) and the entity title — never a fallback like "Someone"/"your session". */
  bold: boolean;
}

/**
 * Maps a notification's raw `type` (the backend's routing-key string, e.g.
 * `session.comment.created`) plus its NTF-4 enrichment (`actors`,
 * `entityTitle`) to a list of display segments — bold only on the actor
 * name(s) and the entity title, plain everywhere else (per the mockup:
 * "text-bold on actor fullname and entityTitle only"). `NotificationRow`
 * renders each segment; `bold` never applies to a fallback phrase ("Someone",
 * "your session") since neither is real data.
 *
 * Every known type today comes from `SessionEventsConsumer`'s session-only
 * scope (NTF-2) — post/group/friend types aren't emitted yet, so this falls
 * back to a generic sentence for anything it doesn't recognize, rather than
 * crashing or rendering blank, so the dropdown degrades gracefully the
 * moment a new producer ships.
 *
 * "and N others" is derived from `actors.length` (the bounded, deduped list
 * of *distinct* actors), never `actorCount` (total matched events — the
 * backend's own doc: "may exceed actorIds.size()" when the same actor
 * repeats). A single actor triggering repeat events must not read as
 * "Alice and 2 others" when there's only ever been Alice.
 */
export function getNotificationText(notification: Notification): NotificationTextSegment[] {
  const actor = actorSegment(notification);
  const entity = entitySegment(notification);

  switch (notification.type) {
    case 'session.comment.created':
      return [actor, plain(' commented on '), entity];
    case 'session.participant.joined':
      return [actor, plain(' joined '), entity];
    case 'session.join_request.created':
      return [actor, plain(' requested to join '), entity];
    case 'session.join_request.approved':
      return [plain('Your request to join '), entity, plain(' was approved')];
    case 'session.join_request.rejected':
      return [plain('Your request to join '), entity, plain(' was declined')];
    case 'session.invitation.created':
      return [actor, plain(' invited you to join '), entity];
    default:
      return [plain('You have a new notification')];
  }
}

/** Convenience for tests/consumers that just need the plain concatenated sentence. */
export function notificationTextToString(segments: NotificationTextSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

function plain(text: string): NotificationTextSegment {
  return { text, bold: false };
}

function actorSegment(notification: Notification): NotificationTextSegment {
  if (notification.actors.length === 0) {
    return plain('Someone');
  }
  const primary = notification.actors[0]!.fullName;
  const othersCount = notification.actors.length - 1;
  const text = othersCount > 0 ? `${primary} and ${othersCount} other${othersCount > 1 ? 's' : ''}` : primary;
  return { text, bold: true };
}

function entitySegment(notification: Notification): NotificationTextSegment {
  if (!notification.entityTitle) {
    return plain('your session');
  }
  return { text: `"${notification.entityTitle}"`, bold: true };
}

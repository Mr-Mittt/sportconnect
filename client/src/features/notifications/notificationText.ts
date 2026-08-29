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
 * Known types come from two backend consumers: the `session.*` keys from
 * `SessionEventsConsumer` (NTF-2) and the `user.friend_request.*` keys from
 * `UserEventsConsumer` (U13). Anything else falls back to a generic sentence
 * rather than crashing or rendering blank, so the dropdown degrades gracefully
 * the moment a new producer ships. That graceful degradation is deliberate but
 * it is *not* free: it hid `session.status.started` and `session.participant.left`
 * rendering as "You have a new notification" from the day each shipped, which
 * is what CLIENT-NOTIF-3 fixed. The default branch therefore also warns in dev
 * — silent degradation is exactly how this recurs. When a new routing key is
 * added backend-side (post-impl B7, group-impl B21 are still queued to add
 * some), its case belongs here in the same change.
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
    case 'session.participant.left':
      return [actor, plain(' left '), entity];
    // SESSION-18 passes `actorId = null` (a scheduled job made this transition,
    // not a user), so `actors` is always empty here. Deliberately does not use
    // `actor` — actorSegment would render the bold-suppressed 'Someone' and read
    // as if a person started the session.
    case 'session.status.started':
      return [entity, plain(' has started')];
    case 'session.join_request.created':
      return [actor, plain(' requested to join '), entity];
    case 'session.join_request.approved':
      return [plain('Your request to join '), entity, plain(' was approved')];
    case 'session.join_request.rejected':
      return [plain('Your request to join '), entity, plain(' was declined')];
    case 'session.invitation.created':
      return [actor, plain(' invited you to join '), entity];
    // U13 / CLIENT-NOTIF-5 — `entityType` is USER, not SESSION, so there is no
    // `entity` segment here: the text names only the other person. Both events
    // always carry a real actor (a self-request is rejected upstream), so
    // `actor` never degrades to the bold-suppressed 'Someone' in practice.
    case 'user.friend_request.created':
      return [actor, plain(' wants to be your friend')];
    case 'user.friend_request.accepted':
      return [actor, plain(' is now your friend')];
    default: {
      // CLIENT-NOTIF-4 — compile-time exhaustiveness. Every `NotificationType`
      // handled above narrows `notification.type` to `never` here; add a member
      // to the union without a case and this assignment stops compiling, naming
      // the missing type in the error. This is the half of the guard that fails
      // the build rather than merely logging.
      const unhandled: never = notification.type;
      void unhandled;
      // ...and this is the half that can't be typed away. The union mirrors what
      // the backend emits *at this build*; a client deployed older than the
      // backend will still receive types it has never heard of, so the runtime
      // fallback below is correct behavior, not a safety net for the check above.
      //
      // The rendered text stays deliberately generic (see above), but a type
      // reaching this branch almost always means a backend routing key shipped
      // without its client case — the exact way `session.status.started` and
      // `session.participant.left` each went unnoticed until CLIENT-NOTIF-3.
      // Dev-only: never warn in production, where an unmapped type is a
      // degraded row, not something the user can act on.
      if (import.meta.env.DEV) {
        console.warn(
          `[notifications] no text mapping for type "${notification.type}" — rendering the generic fallback. ` +
            'A backend routing key has probably shipped without its case in getNotificationText.',
        );
      }
      return [plain('You have a new notification')];
    }
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

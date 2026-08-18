import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { getNotificationText } from '../notificationText';
import type { Notification } from '../types';

interface NotificationRowProps {
  notification: Notification;
  onSelect: (notification: Notification) => void;
}

/**
 * One row in the bell dropdown — plain, unread-dot-styled button (not a
 * `DropdownMenuItem`; the dropdown uses `Popover`, not `DropdownMenu`, so it
 * doesn't fight Radix's menu/menuitem roving-keyboard semantics against a
 * scrollable list with its own "Load more"/"Mark all read" actions — see
 * `shared/ui/popover.tsx`'s own comment for why this codebase keeps the two
 * primitives separate). Text segments come entirely from `getNotificationText`
 * — no name/title resolution happens here, it's already server-enriched
 * (NTF-4); only the actor name(s) and the entity title render bold, per
 * `NotificationTextSegment.bold`.
 *
 * Unread: light-blue bullet (`border-accent`), black content (`text-primary`)
 * — bigger than the read bullet, so an unread row reads as visually heavier
 * at a glance, not just differently colored. Read: gray bullet (unchanged,
 * original size) + gray content (both `text-secondary`) — dimmed as a unit
 * once acknowledged, rather than disappearing entirely.
 */
export function NotificationRow({ notification, onSelect }: NotificationRowProps) {
  const segments = getNotificationText(notification);

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className="flex w-full cursor-pointer items-start gap-2 rounded-[7px] px-2 py-2 text-left outline-none hover:bg-surface-1 focus-visible:bg-surface-1"
    >
      <span
        className={`shrink-0 rounded-full ${notification.isRead ? 'mt-1.5 size-1.5 bg-text-secondary' : 'mt-1.25 size-2 bg-border-accent'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-2sm ${notification.isRead ? 'text-text-secondary' : 'text-text-primary'}`}>
          {segments.map((segment, index) => (
            <span key={index} className={segment.bold ? 'font-medium' : undefined}>
              {segment.text}
            </span>
          ))}
        </span>
        <span className="mt-0.5 block text-right text-2xs text-text-muted">
          {formatRelativeTime(notification.updatedAt)}
        </span>
      </span>
      {!notification.isRead && <span className="sr-only">Unread</span>}
    </button>
  );
}

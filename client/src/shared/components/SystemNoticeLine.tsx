import type { ReactNode } from 'react';

interface SystemNoticeLineProps {
  text: string;
  /** The "- 5m ago" tail of a stored system comment; a notice that exists only on this screen has none. */
  trailing?: ReactNode;
  role?: 'status';
}

/**
 * A centered, avatar-less thread event: the look of a `SESSION_SYSTEM` comment ("someone has joined"),
 * shared with CLIENT-GL-39's notices that exist only on the current user's screen (a record command's error).
 * `flex-wrap` so a trailing timestamp drops to a second centered line rather than overflowing the dialog at 375px.
 */
export function SystemNoticeLine({ text, trailing, role }: SystemNoticeLineProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 py-0.5 text-center" role={role}>
      <p className="text-2xs italic text-text-muted">{text}</p>
      {trailing}
    </div>
  );
}

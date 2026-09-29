import i18next from 'i18next';
import type { SessionStatus } from '@/shared/types/session';

/**
 * Shared across SessionCard (used at both sizes by UpcomingMatches and the Matches page),
 * DiscoverStatusFilter, and SessionDetailModal so the 4-state status badge reads identically
 * everywhere a Session appears.
 *
 * CLIENT-I18N-5: a plain function reading the i18next singleton directly, not a component, so it
 * doesn't need `useTranslation()` — same pattern as `shared/lib/relativeTime.ts`. The three call
 * sites above have no i18n subscription of their own either; consistent with how this codebase
 * already ships `relativeTime` inside the (also unsubscribed) `NotificationRow`.
 */
export function getSessionStatusLabel(status: SessionStatus): string {
  return i18next.t(`enums:sessionStatus.${status}`);
}

export const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  SCHEDULED: 'text-text-accent',
  ONGOING: 'text-text-success',
  // The app's reserved warning color (client/CLAUDE.md) — PREPARING is the "needs attention
  // before it starts" state, same semantic the approval-queue card already uses this token for.
  PREPARING: 'text-amber-800',
  COMPLETED: 'text-text-muted',
  CANCELLED: 'text-text-danger',
};

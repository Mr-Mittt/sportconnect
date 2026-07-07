import { differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';

/**
 * Formats an ISO timestamp as the mockup's short relative style: "just now",
 * "5m ago", "2h ago", "3d ago". Uses date-fns for the date math (per HF-3's
 * "use a date lib" requirement); only the unit labels are ours.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const minutes = differenceInMinutes(now, date);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = differenceInHours(now, date);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = differenceInDays(now, date);
  return `${days}d ago`;
}

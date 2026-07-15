// Shared by every mock-backed rail hook (useUpcomingMatches/useGroupBroadcasts) —
// the mockup shows relative times ('2h ago', 'Tomorrow'), so timestamps are
// computed from load time rather than hardcoded, so the UI renders the same
// relative labels on any day. Moved out of home-feed/mockData.ts (FEED-5)
// once a second consumer (the Groups page) needed the same mock data.
const HOUR_MS = 60 * 60 * 1000;

export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

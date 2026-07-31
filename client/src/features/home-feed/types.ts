// SportKey/SportProfile moved to src/shared/types/sport.ts (HF-2 — the shared
// SportSwitcher needs them; shared code never imports from features).
// TrendingHashtag/GroupBroadcast moved to src/shared/types/rail.ts (FEED-5 —
// the Groups page's right rail needs them too); Session moved there too
// (CLIENT-SESSION-1, real modules/session data replacing the old mock
// UpcomingMatch type). All re-exported here so HF-0's contract for this
// module still holds.
export type { SportKey, SportProfile } from '@/shared/types/sport';
export type { TrendingHashtag, GroupBroadcast } from '@/shared/types/rail';
export type { Session as UpcomingMatch } from '@/shared/types/session';

// Post moved to @/features/feed/types (FEED-1) — that's the real DTO shape
// now, the mock one it replaced is gone.

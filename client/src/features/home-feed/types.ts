// SportKey/SportProfile moved to src/shared/types/sport.ts (HF-2 — the shared
// SportSwitcher needs them; shared code never imports from features).
// UpcomingMatch/TrendingHashtag/GroupBroadcast moved to src/shared/types/rail.ts
// (FEED-5 — the Groups page's right rail needs them too). Both re-exported
// here so HF-0's contract for this module still holds.
export type { SportKey, SportProfile } from '@/shared/types/sport';
export type { UpcomingMatch, TrendingHashtag, GroupBroadcast } from '@/shared/types/rail';

// Post moved to @/features/feed/types (FEED-1) — that's the real DTO shape
// now, the mock one it replaced is gone.

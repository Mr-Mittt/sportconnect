// SportKey/SportProfile moved to src/shared/types/sport.ts (HF-2 — the shared
// SportSwitcher needs them; shared code never imports from features). Re-exported
// here so HF-0's contract for this module still holds.
export type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SportKey } from '@/shared/types/sport';

// Post moved to @/features/feed/types (FEED-1) — that's the real DTO shape
// now, the mock one it replaced is gone.

export interface UpcomingMatch {
  id: string;
  sport: SportKey;
  title: string;
  startsAt: string; // ISO timestamp
  location: string;
  spotsLeft: number; // 0 = full
}

export interface TrendingHashtag {
  tag: string;
  postCount: number;
}

export interface GroupBroadcast {
  id: string;
  groupId: string;
  groupName: string;
  groupInitials: string;
  colorRamp: string;
  text: string;
  createdAt: string; // ISO timestamp
}

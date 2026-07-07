// SportKey/SportProfile moved to src/shared/types/sport.ts (HF-2 — the shared
// SportSwitcher needs them; shared code never imports from features). Re-exported
// here so HF-0's contract for this module still holds.
export type { SportKey, SportProfile } from '@/shared/types/sport';
import type { SportKey } from '@/shared/types/sport';

export interface Post {
  id: string;
  sport: SportKey;
  authorName: string;
  authorInitials: string;
  authorAvatarUrl?: string;
  createdAt: string; // ISO timestamp
  text: string;
  hashtags: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

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

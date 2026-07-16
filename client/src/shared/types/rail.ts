import type { SportKey } from './sport';

// Right-rail content types (UpcomingMatches/TrendingHashtags/GroupBroadcasts) —
// moved out of home-feed/types.ts (FEED-5) once the Groups page needed the
// same rail as Home Feed. Mirrors HF-2's SportKey/SportProfile relocation:
// shared code never imports from features.

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
  // number, not string — matches the real backend Post.id/groupId this is
  // built from (FEED-7), same convention as Post/Comment/Group ids.
  id: number;
  groupId: number;
  groupName: string;
  groupInitials: string;
  colorRamp: string;
  text: string;
  createdAt: string; // ISO timestamp
}

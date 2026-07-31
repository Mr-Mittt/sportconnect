// Right-rail content types (UpcomingMatches/TrendingHashtags/GroupBroadcasts) —
// moved out of home-feed/types.ts (FEED-5) once the Groups page needed the
// same rail as Home Feed. Mirrors HF-2's SportKey/SportProfile relocation:
// shared code never imports from features.
//
// UpcomingMatches' own data type is `Session` (shared/types/session.ts), not a
// bespoke projection here — CLIENT-SESSION-1 de-mocked it against the real
// `modules/session` domain, and the full Session shape (status, group vs.
// standalone, location) is exactly what the card and the Matches page both need,
// so there's no lighter projection worth introducing.

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

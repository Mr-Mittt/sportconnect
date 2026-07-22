// Typed 1:1 against the real backend DTOs (modules/user/user-api), verified
// against source, not guessed.

// UserFriendshipStatus (U6) — also reused for a selected friend/search
// result's action-bar state in FriendProfilePanel.
export type FriendshipStatus = 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'FRIENDS';

// UserResponse (modules/user/user-api) — subset actually used by the
// Friends page; unused fields (email, dateOfBirth, gender, height/weight,
// roles, etc.) are irrelevant here and intentionally omitted. `fullName` is
// a computed getter (`getFullName()`) on the Java DTO, not a stored field —
// it still serializes as a normal JSON property (Jackson bean
// introspection picks up any public getter), same as `Post.userFullName`
// elsewhere in this codebase.
export interface FriendUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
}

// UserSearchResponse (GET /api/users/search) — U6's directory-search
// projection, lighter than UserResponse (no bio/coverUrl). `username` is
// `string | null`, not always a set string (live-verified against the real
// backend at GRP-4 pickup: a freshly registered account with no username set
// returns `null` here) — FRIEND-1's original type never rendered this field
// anywhere, so the gap went unnoticed until GRP-4's InviteFriendModal became
// the first consumer to actually display it.
export interface UserSearchResult {
  id: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  friendshipStatus: FriendshipStatus;
}

// FriendRequestResponse (GET /api/users/friends/requests/{sent,received}).
// Both list endpoints are server-filtered to PENDING only — a terminal
// ACCEPTED/DECLINED/CANCELLED row never appears in either list.
export interface FriendRequest {
  requestId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string; // ISO timestamp
}

export type FriendSectionKey = 'online' | 'friendRequests' | 'offline' | 'blocked';

/** One row in the rail's merged "Friend Requests" section — `id` is always
 * the OTHER person's id (the sender for an incoming request, the receiver
 * for an outgoing one), never the current user's. */
export interface FriendRequestRow {
  id: string;
  name: string;
  direction: 'incoming' | 'outgoing';
}

/** The person currently shown in `FriendProfilePanel` — `FriendUser` plus
 * the two fields resolved by `useFriendsPageData` from whichever
 * already-loaded list the person came from (friends/received/sent/search),
 * never fetched directly. `requestId` is only set for `PENDING_RECEIVED`
 * (needed to call accept/decline). */
export interface SelectedPerson extends FriendUser {
  friendshipStatus: FriendshipStatus;
  requestId: string | null;
}

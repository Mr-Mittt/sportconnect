// Typed 1:1 against the real backend DTOs, verified against source
// (modules/social/post-api, modules/social/group-api) — not the AUTH/FEED
// epic doc's illustrative sketch, which predates a few corrections (see
// FEED-0's implementation summary).
//
// Id types deliberately mirror the backend's actual generation strategy:
// Post/Comment/Group/GroupMember/Hashtag use a JPA `Long`/Postgres
// `BIGSERIAL` id today, so `number` is correct here. This is a value
// judgment, not an oversight — a filed backend ticket
// (modules/social/post-impl/docs/BACKLOG_V1.md · C11,
// modules/social/group-impl/docs/BACKLOG_V1.md · A1) would migrate these to
// Snowflake ids, which requires flipping these fields to `string` (a real
// Snowflake value can exceed JS's Number.MAX_SAFE_INTEGER). Don't "fix" this
// preemptively — wait for that migration to actually ship, then do the
// `number` -> `string` flip as its own follow-up ticket.
import type { ApiResponse } from '@/shared/types/api';

export type PostType = 'USER_FEED' | 'GROUP_POST' | 'GROUP_BROADCAST';

// Swagger docs this as exactly these 3 values (CreatePostRequest.visibility);
// the backend field itself is a plain String, not a Java enum.
export type PostVisibility = 'public' | 'friends' | 'private';

export interface PostMedia {
  id: number;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl: string | null;
  displayOrder: number;
}

// Recursive to match CommentResponse.replies — one level of nesting in
// practice (a reply to a reply is not rejected server-side, per post-impl's
// A4), but the type itself doesn't enforce a depth limit.
export interface Comment {
  id: number;
  postId: number;
  userId: string;
  userFullName: string;
  userAvatarUrl: string | null;
  content: string;
  parentCommentId: number | null;
  likeCount: number;
  replyCount: number;
  isLikedByCurrentUser: boolean;
  replies: Comment[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface Post {
  id: number;
  userId: string;
  // Nullable, verified against a live backend (2026-07-13): PostServiceImpl
  // .mapToResponse() never populated userFullName or shareCount — no builder
  // call for either, confirmed by reading the mapper directly. Unlike
  // CommentResponse (which DOES resolve userFullName correctly via a working
  // lookup), this was Post-specific. Fixed by backend ticket A9:
  // modules/social/post-impl/docs/BACKLOG_MVP.md.
  userFullName: string | null;
  userAvatarUrl: string | null;
  postType: PostType;
  groupId: number | null;
  content: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  // A12: sportId is intentionally the only sport reference on the wire —
  // sports are static reference data, resolved client-side via
  // sportKeyForId()/useSportCatalog() instead of a backend-joined name (same
  // precedent as GroupInvitation.sportId below). PostResponse.sportName was
  // removed server-side because nothing here ever read it.
  sportId: number | null;
  visibility: PostVisibility;
  media: PostMedia[];
  // Does NOT include a leading '#' — verified against a live backend
  // (2026-07-13): HashtagServiceImpl's extraction regex `#(\w+)` captures
  // group 1 only, stripping the '#'. This differs from HF-0/HF-3/HF-5's
  // mock-data convention (mock hashtags DO include '#') — a mapping/prefix
  // step is needed wherever FEED-1/FEED-6 bridge real data into those
  // existing mock-convention-based components.
  hashtags: string[];
  previewComments: Comment[];
  likeCount: number;
  commentCount: number;
  // Nullable — see userFullName's note, same never-populated bug.
  shareCount: number | null;
  isLikedByCurrentUser: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  broadcastEndTime: string | null; // ISO timestamp, GROUP_BROADCAST only
}

export interface Hashtag {
  id: number;
  // Does NOT include a leading '#' — same verified behavior as Post.hashtags
  // above (both come from the same extraction/storage path).
  tag: string;
  usageCount: number;
}

// Minimal per-group projection Feed/PostCard need for a GROUP_POST/
// GROUP_BROADCAST's "username > groupname" link: the display name, plus
// sportId so clicking it can switch the Groups page to that group's sport
// before selecting it (a group is 1:1 with exactly one sport).
export interface GroupRef {
  groupName: string;
  sportId: number;
}

// pinnedPosts is only populated by GET /api/groups/{groupId} (getGroup) —
// null on every other endpoint that returns a GroupResponse (e.g. the
// user-groups list this feature's useUserGroups() hook calls).
export interface Group {
  id: number;
  sportId: number;
  groupName: string;
  description: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPrivate: boolean;
  isActive: boolean;
  createdBy: string;
  createdByFullName: string;
  memberCount: number;
  currentUserRole: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  pinnedPosts: Post[] | null;
}

export interface GroupMember {
  id: number;
  groupId: number;
  userId: string;
  userFullName: string;
  userAvatarUrl: string | null;
  roleId: number;
  roleName: string;
  roleLevel: number;
  joinedAt: string; // ISO timestamp
}

// GroupSearchResponse (GET /api/groups/public) — a lighter projection than
// Group/GroupResponse, purpose-built for browsing/searching public groups
// before joining. isMember lets the UI skip a "Request to join" action for
// a group the user already belongs to.
export interface GroupSearchResult {
  id: number;
  sportId: number;
  groupName: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  createdByFullName: string;
  isMember: boolean;
}

// JoinRequestResponse. status is a plain string on the wire (verified
// against GroupServiceImpl), not a Java enum — exactly these 3 lowercase
// literals.
export type JoinRequestStatus = 'pending' | 'accepted' | 'declined';

export interface JoinRequest {
  id: number;
  groupId: number;
  groupName: string;
  userId: string;
  userFullName: string;
  userAvatarUrl: string | null;
  status: JoinRequestStatus;
  message: string | null;
  reviewedBy: string | null;
  reviewedByFullName: string | null;
  reviewedAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// GroupInvitationResponse. status is a plain string on the wire (verified
// against GroupServiceImpl) — 5 literals: the two in-flight ones GRP-3 shows
// (pending_owner: awaiting owner/admin approval; pending_user: approved,
// awaiting the invitee) plus 3 terminal ones no in-scope endpoint returns
// today (getMemberSentInvitations only ever returns the two pending ones).
export type InvitationStatus =
  | 'pending_owner'
  | 'pending_user'
  | 'accepted'
  | 'declined_by_owner'
  | 'declined_by_user';

export interface GroupInvitation {
  id: number;
  groupId: number;
  groupName: string;
  // GRP-8/B15: the group's own sportId — lets the invitee-facing accept flow
  // switch straight to the right sport pill and offer to add the sport
  // profile, without a second round trip. No sportName on the wire (B15
  // decision: sports are static reference data, resolved client-side via
  // sportKeyForId + SPORT_PROFILE_CONFIG instead of a backend join).
  sportId: number;
  inviterId: string;
  inviterFullName: string;
  // GRP-8/B14: every member who has invited this invitee to this group,
  // oldest-first — a singleton array containing just inviterFullName in the
  // common single-inviter case. inviterFullName/inviterId are kept unchanged
  // (still "who originally created this row") for the call sites that don't
  // need the full list.
  inviterFullNames: string[];
  inviteeId: string;
  inviteeFullName: string;
  status: InvitationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// CreateInvitationRequest — inviteeId is the only field (@NotNull).
export interface CreateInvitationPayload {
  inviteeId: string;
}

// CreateGroupRequest. sportId/groupName are the only server-required
// fields (@NotNull/@NotBlank) — isPrivate has no required-validation
// annotation but is still sent explicitly (defaults to false client-side)
// since the DTO gives no visible server-default guarantee.
export interface CreateGroupPayload {
  sportId: number;
  groupName: string;
  description?: string;
  isPrivate: boolean;
}

// UpdateGroupRequest — partial update, only non-null fields are applied
// server-side (GroupController.updateGroup's own @Operation description).
// Owner or admin only; GRP-1 only ever sent `isPrivate` — GRP-2 adds
// rules/schedule as the second use of this same payload/endpoint.
export interface UpdateGroupPayload {
  groupName?: string;
  description?: string;
  avatarUrl?: string;
  coverUrl?: string;
  isPrivate?: boolean;
  rules?: string;
  schedule?: string;
}

// GroupInfoResponse (GET /api/groups/{groupId}/info) — rules/schedule text.
// Writable via the existing UpdateGroupPayload/updateGroup endpoint above,
// but GroupResponse itself never returns them — this is the only response
// shape that does, hence a dedicated query hook (useGroupInfo) rather than
// reusing Group.
export interface GroupInfo {
  groupId: number;
  groupName: string;
  rules: string | null;
  schedule: string | null;
  updatedAt: string; // ISO timestamp
}

// GroupSettingsResponse (GET/PUT /api/groups/{groupId}/settings). B7 replaced
// a manually-set maxMembers with a fixed group-type tier system — the real
// DTO still carries a resolved `maxMembers` number, but GRP-2 deliberately
// doesn't display it (no UI to change it yet — that's B10, not built), so
// it's intentionally omitted here rather than modeled and left unused.
export interface GroupSettings {
  id: number;
  groupId: number;
  allowMemberPosts: boolean;
  requirePostApproval: boolean;
  allowMemberInvites: boolean;
  groupTypeName: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// UpdateGroupSettingsRequest — owner-only (stricter than UpdateGroupPayload's
// owner+admin), partial update. maxMembers was removed server-side by B7 —
// never send it.
export interface UpdateGroupSettingsPayload {
  allowMemberPosts?: boolean;
  requirePostApproval?: boolean;
  allowMemberInvites?: boolean;
}

// CreateJoinRequestRequest — looked up by group NAME server-side
// (GroupServiceImpl.findByGroupName), not id; there is no groupId field on
// this request at all.
export interface JoinRequestPayload {
  groupName: string;
  message?: string;
}

// CreateGroupRequest.groupName's real server-side @Size(3, 100).
export const MIN_GROUP_NAME_LENGTH = 3;
export const MAX_GROUP_NAME_LENGTH = 100;

// CreateGroupRequest.description's real server-side @Size(max = 5000).
export const MAX_GROUP_DESCRIPTION_LENGTH = 5000;

export interface CreatePostPayload {
  content: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  sportId?: number;
  groupId?: number;
  postType?: PostType;
  visibility?: PostVisibility;
  mediaUrls?: string[];
  broadcastEndTime?: string; // ISO timestamp; GROUP_BROADCAST only, server defaults to now()+24h if omitted
}

export interface CreateCommentPayload {
  content: string;
  parentCommentId?: number;
}

// CreateCommentRequest.content's real server-side @Size(max = 1000) —
// enforced client-side too (FEED-2) so the textarea/input never lets a user
// type past what the backend will actually accept.
export const MAX_COMMENT_LENGTH = 1000;

// CreatePostRequest.content's real server-side @Size(max = 5000), same
// reasoning as MAX_COMMENT_LENGTH above (FEED-3).
export const MAX_POST_LENGTH = 5000;

// Matches Spring Data's Page<T> JSON serialization exactly (confirmed
// against the real controllers — every paginated feed/group/hashtag
// endpoint returns this shape wrapped in ApiResponse<T>).
export interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number; // current page index, 0-based
  size: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

export type PagedApiResponse<T> = ApiResponse<PageResponse<T>>;

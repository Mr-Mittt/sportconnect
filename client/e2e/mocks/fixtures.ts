import type { Page } from '@playwright/test';
import type { User } from '../../src/features/auth/types.ts';
import type {
  Comment,
  Group,
  GroupInfo,
  GroupInvitation,
  GroupMember,
  GroupSearchResult,
  GroupSettings,
  Hashtag,
  JoinRequest,
  PageResponse,
  Post,
} from '../../src/features/feed/types.ts';
import type { FriendRequest, FriendUser, UserSearchResult } from '../../src/features/friends/types.ts';
import type { UserResponse } from '../../src/features/profile/types.ts';
import { hoursAgo, hoursFromNow } from '../../src/shared/lib/mockClock.ts';
import type { Location } from '../../src/shared/types/location.ts';
import type { Session, SessionParticipant } from '../../src/shared/types/session.ts';
import type { UserSportProfileResponse } from '../../src/shared/types/sport.ts';
import { MOCK_SERVER_URL } from './mockServerConfig.ts';

// Reused across AUTH-8 and FEED-10 rather than each test inventing its own
// ad-hoc response shapes (per MSW-0's acceptance criteria).
export const mockUser: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

// ADMIN-1: a second account holding ADMIN, for the /admin route guard's role
// branch. Deliberately holds USER as well — that is how a real admin is
// provisioned (registration grants USER, ADMIN is added on top), and an
// ADMIN-only account would fail every hasRole('USER') endpoint in the app.
export const mockAdminUser: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.com',
  firstName: 'Alex',
  lastName: 'Admin',
  username: 'alexadmin',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER', 'ADMIN'],
};

export const mockPassword = 'password123';
export const mockAccessToken = 'mock-access-token';

// A distinct refresh-token string used only to simulate the httpOnly cookie
// round-trip (set on login/register/refresh, checked on refresh/logout).
// Real tests never read this directly — the browser handles the cookie.
export const mockRefreshToken = 'mock-refresh-token';

// ADMIN-1: a per-account refresh token, so /auth/refresh can tell which user the
// session belongs to and return that user. Without this the handler's single
// fixed response would hand back mockUser on every bootstrap, and an admin who
// navigated to /admin would be re-identified as a plain USER and redirected —
// the test would fail for a reason that has nothing to do with the guard.
export const mockAdminRefreshToken = 'mock-admin-refresh-token';

// SPORT-3: mockUser holds a profile for every sport the real MVP catalog now
// serves (A6 — Badminton=1, Pickleball=3; see sportIdMap.ts's note) — the
// "3-sport cap" this fixture used to model (Soccer/Basketball/Tennis) is no
// longer representable at all: a user can never hold 3 active profiles when
// only 2 sports exist. HF-11's step 7 now asserts the "every available sport
// already held" behavior instead of the numeric-cap behavior — see that
// spec's own updated note.
export const mockSportProfiles: UserSportProfileResponse[] = [
  {
    id: 1,
    userId: mockUser.id,
    sportId: 1,
    sportName: 'Badminton',
    skillLevel: 'intermediate',
    yearsOfExperience: 4,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
  {
    id: 2,
    userId: mockUser.id,
    sportId: 3,
    sportName: 'Pickleball',
    skillLevel: 'beginner',
    yearsOfExperience: 1,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
];

// PROFILE-7: mockUser's own full `UserResponse` — GET /api/users/:userId
// (friends.ts) previously only ever returned the narrow `FriendUser` shape
// (id/fullName/avatarUrl/coverUrl/bio), fine for looking up *other* users but
// missing firstName/lastName/username/city/country/createdAt/etc. that
// useMyProfile/ProfileHeader/EditProfileModal need for the caller's *own*
// profile — a real gap, never hit before this ticket since no earlier
// ticket ran the real /profile page through Playwright/MSW.
export const mockMyProfile: UserResponse = {
  id: mockUser.id,
  email: mockUser.email,
  firstName: mockUser.firstName,
  lastName: mockUser.lastName,
  username: mockUser.username,
  phoneNumber: mockUser.phoneNumber,
  dateOfBirth: null,
  gender: null,
  bio: 'Weekend warrior. Badminton on Saturdays, pickleball whenever the courts are free.',
  avatarUrl: mockUser.avatarUrl,
  coverUrl: null,
  location: null,
  city: 'Riverside',
  country: 'USA',
  heightCm: null,
  weightKg: null,
  shoeSizeCm: null,
  isEmailVerified: true,
  isActive: true,
  roles: mockUser.roles,
  createdAt: '2026-06-01T10:00:00',
  lastLoginAt: null,
  fullName: `${mockUser.firstName} ${mockUser.lastName}`,
};

// Feed/groups/hashtags fixtures (FEED-0) — reused by feed.ts's handlers and
// by any future FEED-1..FEED-10 e2e spec, same reasoning as the auth
// fixtures above.
export const mockGroup: Group = {
  id: 1,
  // SPORT-3: Badminton (1) — matches mockPost/mockGroupPost's sportId. The
  // group's own "Friday Night Football" display name is unrelated to its
  // real sportId (that mismatch already existed before SPORT-3 too, see the
  // old FEED-4 note this replaced) — display copy is deliberately left as-is
  // across this fixture rewrite; only the numeric sportId/sportName fields
  // that drive real filtering/badge behavior changed.
  sportId: 1,
  groupName: 'Friday Night Football',
  description: 'Weekly 5-a-side, all skill levels welcome.',
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  memberCount: 12,
  currentUserRole: 'group_member',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
  pinnedPosts: null,
};

// FEED-10: a second pre-seeded group where the test user is the owner (not
// just a member, like mockGroup) — the dedicated fixture for asserting
// CreatePostForm's "Broadcast" toggle appears for an owner/admin and doesn't
// for a plain member. sportId 3 (Pickleball) deliberately differs from
// mockGroup's Badminton (1), so both are reachable under distinct sport
// pills rather than colliding under the same filter.
export const mockOwnedGroup: Group = {
  id: 3,
  sportId: 3,
  groupName: 'Weekend Tennis Ladder',
  description: 'Casual ladder, singles and doubles.',
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  memberCount: 6,
  currentUserRole: 'group_owner',
  createdAt: '2026-06-05T10:00:00',
  updatedAt: '2026-06-05T10:00:00',
  pinnedPosts: null,
};

// GRP-2: settings for mockOwnedGroup (the only group the test user owns) —
// GET/PUT /api/groups/:groupId/settings.
export const mockGroupSettings: GroupSettings = {
  id: 1,
  groupId: mockOwnedGroup.id,
  allowMemberPosts: true,
  requirePostApproval: false,
  allowMemberInvites: false,
  groupTypeName: 'DEFAULT',
  createdAt: '2026-06-05T10:00:00',
  updatedAt: '2026-06-05T10:00:00',
};

// GRP-2: rules/schedule for mockOwnedGroup — GET /api/groups/:groupId/info,
// written via PUT /api/groups/:groupId/generalData (B19/GRP-9).
export const mockGroupInfo: GroupInfo = {
  groupId: mockOwnedGroup.id,
  groupName: mockOwnedGroup.groupName,
  isPrivate: mockOwnedGroup.isPrivate,
  description: null,
  avatarUrl: null,
  coverUrl: null,
  rules: null,
  schedule: null,
  updatedAt: '2026-06-05T10:00:00',
};

// GRP-3: GET /api/groups/:groupId/members roster for mockOwnedGroup — the
// only fixture group where the test user is group_owner, needed for the
// Members tab's owner-only "Waiting for group approve" section and the
// "Group administrator"/"Members" split. mockUser first (owner), then one
// admin and one plain member.
export const mockGroupMembers: GroupMember[] = [
  {
    id: 1,
    groupId: mockOwnedGroup.id,
    userId: mockUser.id,
    userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
    userAvatarUrl: null,
    roleId: 1,
    roleName: 'group_owner',
    roleLevel: 3,
    joinedAt: '2026-06-05T10:00:00',
  },
  {
    id: 2,
    groupId: mockOwnedGroup.id,
    userId: '33333333-3333-4333-8333-333333333333',
    userFullName: 'Sam Ito',
    userAvatarUrl: null,
    roleId: 2,
    roleName: 'group_admin',
    roleLevel: 2,
    joinedAt: '2026-06-06T10:00:00',
  },
  {
    id: 3,
    groupId: mockOwnedGroup.id,
    userId: '44444444-4444-4444-8444-444444444444',
    userFullName: 'Alex Chen',
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-06-07T10:00:00',
  },
];

// GRP-3: GET /api/groups/:groupId/join-requests — a pending request against
// mockOwnedGroup (distinct from mockJoinRequest, which is the test user's
// OWN outgoing request against mockPublicGroup) for the "Waiting for group
// approve" section's accept/decline flow.
export const mockGroupJoinRequest: JoinRequest = {
  id: 2,
  groupId: mockOwnedGroup.id,
  groupName: mockOwnedGroup.groupName,
  userId: '22222222-2222-4222-8222-222222222222',
  userFullName: 'Priya Shah',
  userAvatarUrl: null,
  status: 'pending',
  message: null,
  reviewedBy: null,
  reviewedByFullName: null,
  reviewedAt: null,
  createdAt: '2026-07-16T00:00:00',
  updatedAt: '2026-07-16T00:00:00',
};

// GRP-3: GET /api/groups/:groupId/invitations/sent — an invitation the test
// user sent for mockOwnedGroup, still pending owner approval (the test user
// is the owner here, but a plain member can send one too in the real
// backend; this fixture only needs to exercise the "Waiting for user
// accept" section rendering, not that permission nuance).
export const mockSentInvitation: GroupInvitation = {
  id: 1,
  groupId: mockOwnedGroup.id,
  groupName: mockOwnedGroup.groupName,
  sportId: mockOwnedGroup.sportId,
  inviterId: mockUser.id,
  inviterFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  inviterFullNames: [`${mockUser.firstName} ${mockUser.lastName}`],
  inviteeId: '55555555-5555-4555-8555-555555555555',
  inviteeFullName: 'Robin Park',
  status: 'pending_owner',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-07-17T00:00:00',
  updatedAt: '2026-07-17T00:00:00',
};

// GRP-7: GET /api/groups/:groupId/invitations — mockOwnedGroup's
// owner-approval queue. Deliberately sent by Sam Ito (the group's admin,
// `mockGroupMembers[1]`), not the test user — post-B11, an owner/admin's own
// invitation would skip pending_owner entirely, so the only invitation that
// can realistically sit here is one a plain member/admin sent.
export const mockGroupInvitation: GroupInvitation = {
  id: 3,
  groupId: mockOwnedGroup.id,
  groupName: mockOwnedGroup.groupName,
  sportId: mockOwnedGroup.sportId,
  inviterId: '33333333-3333-4333-8333-333333333333', // Sam Ito, mockGroupMembers[1]
  inviterFullName: 'Sam Ito',
  inviterFullNames: ['Sam Ito'],
  inviteeId: '66666666-6666-4666-8666-666666666666',
  inviteeFullName: 'Morgan Diaz',
  status: 'pending_owner',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-07-18T00:00:00',
  updatedAt: '2026-07-18T00:00:00',
};

export const mockPost: Post = {
  id: 1,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great match today! #fridayrun',
  latitude: null,
  longitude: null,
  locationName: null,
  // SPORT-3: Badminton (1) — one of the 2 real MVP-active sports (A6).
  sportId: 1,
  visibility: 'public',
  media: [],
  // No leading '#' — matches the real backend's extraction/storage format
  // (verified against a live backend, 2026-07-13), not HF-0's mock-data
  // convention, which does include '#'.
  hashtags: ['fridayrun'],
  previewComments: [],
  likeCount: 3,
  commentCount: 1,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
  broadcastEndTime: null,
};

export const mockGroupPost: Post = {
  ...mockPost,
  id: 2,
  postType: 'GROUP_POST',
  groupId: mockGroup.id,
  content: 'Who is in for Friday? #fridayrun',
  createdAt: '2026-07-13T08:00:00',
  updatedAt: '2026-07-13T08:00:00',
};

// A friend's post, not the logged-in test user's — covers the "no delete
// menu on someone else's post" case and gives the feed a second sport
// (Pickleball, sportId 3) so sport-filtering has something real to filter.
// Variable name/content text kept as-is across the SPORT-3 fixture rewrite
// (display copy is unrelated to the real sportId) — only sportId changed.
export const mockBasketballPost: Post = {
  ...mockPost,
  id: 4,
  userId: '22222222-2222-4222-8222-222222222222',
  userFullName: 'Priya Shah',
  content: 'Looking for 2 more players for Sunday pickup at Riverside courts. #pickup',
  hashtags: ['pickup'],
  sportId: 3,
  likeCount: 9,
  commentCount: 6,
  createdAt: '2026-07-13T06:00:00',
  updatedAt: '2026-07-13T06:00:00',
};

export const mockBroadcastPost: Post = {
  ...mockPost,
  id: 3,
  postType: 'GROUP_BROADCAST',
  groupId: mockGroup.id,
  content: 'Pitch is booked for 7pm — see you all there!',
  hashtags: [],
  createdAt: '2026-07-13T07:00:00',
  updatedAt: '2026-07-13T07:00:00',
  // Computed relative to load time, not hardcoded (FEED-10 fix) — the
  // previous hardcoded '2026-07-14T07:00:00' had silently drifted into the
  // past relative to "today" by the time this was found, so a genuine expiry
  // filter (added in FEED-10 for the /posts/broadcast handler) would have
  // wrongly excluded this "active" fixture. Never hardcode a broadcast expiry
  // date for the same reason mockClock.ts's matches don't.
  broadcastEndTime: hoursFromNow(24),
};

// FEED-10: a second broadcast, genuinely expired, for the
// `/posts/broadcast` handler's expiry filter to exclude — proves the
// exclusion is a real filter over multiple candidates, not just "we didn't
// put it in the array."
export const mockExpiredBroadcastPost: Post = {
  ...mockPost,
  id: 5,
  postType: 'GROUP_BROADCAST',
  groupId: mockGroup.id,
  content: 'Last week: pitch was booked for 7pm.',
  hashtags: [],
  createdAt: '2026-07-06T07:00:00',
  updatedAt: '2026-07-06T07:00:00',
  broadcastEndTime: hoursAgo(24),
};

export const mockHashtag: Hashtag = {
  id: 1,
  tag: 'fridayrun', // no leading '#' — see mockPost.hashtags' note above
  usageCount: 12,
};

// FEED-5 fixtures: a public group the test user has NOT joined yet
// (distinct sportId from mockGroup so sport-filtered search has something
// real to filter), for exercising the "Request to join" flow.
export const mockPublicGroup: GroupSearchResult = {
  id: 2,
  sportId: 3, // Pickleball, same id as mockBasketballPost
  groupName: 'Riverside Hoopers',
  description: 'Pickup games every weekend.',
  avatarUrl: null,
  memberCount: 8,
  createdByFullName: 'Priya Shah',
  isMember: false,
};

export const mockJoinRequest: JoinRequest = {
  id: 1,
  groupId: mockPublicGroup.id,
  groupName: mockPublicGroup.groupName,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: null,
  status: 'pending',
  message: null,
  reviewedBy: null,
  reviewedByFullName: null,
  reviewedAt: null,
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
};

// GRP-7: GET /api/groups/invitations/user — an invitation addressed to the
// test user for mockPublicGroup (Riverside Hoopers), a group they haven't
// joined yet. Backs GroupDiscoveryPanel's new "Invitations" section and its
// accept-then-navigate journey (accepting should land the user inside
// Riverside Hoopers even though it's a different sport than whatever's
// currently active).
export const mockReceivedInvitation: GroupInvitation = {
  id: 4,
  groupId: mockPublicGroup.id,
  groupName: mockPublicGroup.groupName,
  sportId: mockPublicGroup.sportId,
  inviterId: '77777777-7777-4777-8777-777777777777',
  inviterFullName: 'Priya Shah',
  inviterFullNames: ['Priya Shah'],
  inviteeId: mockUser.id,
  inviteeFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  status: 'pending_user',
  reviewedBy: '77777777-7777-4777-8777-777777777777',
  reviewedAt: '2026-07-19T00:00:00',
  createdAt: '2026-07-19T00:00:00',
  updatedAt: '2026-07-19T00:00:00',
};

// FEED-2 comment fixtures. mockComment is mockPost's one existing comment
// (mockPost.commentCount is 1) so the two stay consistent for any test
// asserting on both.
export const mockComment: Comment = {
  id: 1,
  postId: mockPost.id,
  commentType: 'USER',
  userId: 'priya-shah',
  userFullName: 'Priya Shah',
  userAvatarUrl: null,
  content: 'Nice one, count me in for next week!',
  parentCommentId: null,
  likeCount: 1,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: '2026-07-13T09:30:00',
  updatedAt: '2026-07-13T09:30:00',
};

// FRIEND-1 fixtures. mockFriend is mockUser's one accepted friend (renders
// under Offline — Online always empty, no presence system exists).
export const mockFriend: FriendUser = {
  id: 'priya-shah',
  fullName: 'Priya Shah',
  avatarUrl: null,
  coverUrl: null,
  bio: 'Weekend hooper, always down for pickup.',
};

// Incoming — sent TO mockUser, resolves the rail's "Friend Requests" row and
// the profile panel's Accept/Decline action bar.
export const mockIncomingFriendRequest: FriendRequest = {
  requestId: 'req-incoming-1',
  senderId: 'hana-kim',
  senderName: 'Hana Kim',
  receiverId: mockUser.id,
  receiverName: `${mockUser.firstName} ${mockUser.lastName}`,
  status: 'PENDING',
  createdAt: '2026-07-20T00:00:00',
};

// Outgoing — sent BY mockUser, resolves to the profile panel's disabled
// "Waiting for response" state.
export const mockSentFriendRequest: FriendRequest = {
  requestId: 'req-outgoing-1',
  senderId: mockUser.id,
  senderName: `${mockUser.firstName} ${mockUser.lastName}`,
  receiverId: 'diego-alvarez',
  receiverName: 'Diego Alvarez',
  status: 'PENDING',
  createdAt: '2026-07-20T00:00:00',
};

// A directory-search result with no existing relationship — Add mode's
// "Matches for ..." row, resolves to the profile panel's enabled
// "Send a friend request" action.
export const mockSearchResultUser: UserSearchResult = {
  id: 'owen-clarke',
  fullName: 'Owen Clarke',
  username: 'owenclarke',
  avatarUrl: null,
  city: null,
  country: null,
  friendshipStatus: 'NONE',
};

// CLIENT-SESSION-1: a shared, sport-scoped venue — sportId 3 (Pickleball),
// matching mockSession below. Reused by the Matches page's "search existing
// location" step in the create-session flow.
export const mockLocation: Location = {
  id: 1,
  sportId: 3,
  sportName: 'Pickleball',
  name: 'Riverside Courts',
  address: '12 River Rd',
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: mockUser.id,
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

// A standalone session mockUser created themselves (Pickleball, sportId 3) —
// not yet joined by mockUser (participantCount 0), so the journey can
// exercise Join -> Leave -> Cancel on one fixture.
export const mockSession: Session = {
  id: 1,
  groupId: null,
  sessionType: 'STANDALONE',
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  sportId: 3,
  sportName: 'Pickleball',
  title: 'Sunday pickup run',
  description: 'Casual 5v5, all levels welcome.',
  location: mockLocation,
  locationNote: 'Court 3',
  // Fixed, not hoursFromNow() — this is computed server-side (mock server's own real
  // wall-clock time at process start), which Playwright's page.clock.setFixedTime() (browser-
  // only) never affects. A relative "hours from now" value here drifted between every mock
  // server restart, silently changing app-home-feed.spec.ts's rendered relative-time text and
  // causing its baselines to look randomly stale (same class of bug HF-11's fixtures already
  // avoid — every other timestamp in this file is a literal string for the same reason).
  scheduledStart: '2026-08-01T19:00:00',
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 0,
  // A real chosen capacity + fixed fee — exercises the "X/Y participants" and VND-amount display
  // paths (SESSION-5/CLIENT-SESSION-3), unlike the two GROUP_RECURRING fixtures below, which stay
  // on the backend's uncapped/free sentinel since a recurring session has no capacity/fee input.
  capacity: 10,
  feeType: 'FIXED',
  feeAmountVnd: 50000,
  initialSlot: 0,
  // These are pre-existing fixture sessions (never created through the create endpoint mid-test)
  // — real SESSION-6 backfilled every pre-existing session to autoApprove=true (preserving their
  // instant-join behavior); only a genuinely new session (the create-handler's own `created`
  // object) defaults to false. mockSession in particular needs this true, or "join" from its
  // empty participantsState (the join/leave/cancel journey's own premise) would land in
  // REQUESTED instead of JOINED.
  autoApprove: true,
  likeCount: 0,
  isLikedByCurrentUser: false,
  // Overwritten per-response by sessions.ts's resolveCallerParticipation (SESSION-9) — this
  // static value only matters as this store's initial seed.
  callerParticipation: null,
  createdAt: '2026-06-20T10:00:00',
  updatedAt: '2026-06-20T10:00:00',
};

// A group-linked session for mockGroup (id 1, Badminton, currentUserRole
// group_member — mockUser is a member, not owner/admin) — created by someone
// else, so canManage is false for mockUser: proves the Cancel button is
// correctly hidden for a session the caller can only join/leave, not manage.
export const mockGroupSession: Session = {
  id: 2,
  groupId: mockGroup.id,
  sessionType: 'GROUP_RECURRING',
  createdBy: 'other-user-id',
  createdByFullName: 'Priya Shah',
  sportId: mockGroup.sportId,
  sportName: 'Badminton',
  title: 'Friday 5-a-side',
  description: null,
  location: { ...mockLocation, id: 2, sportId: mockGroup.sportId, sportName: 'Badminton' },
  locationNote: null,
  scheduledStart: '2026-08-02T19:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 3,
  // GROUP_RECURRING sessions have no capacity/fee input (GroupRecurrenceConfigResponse carries
  // neither) — sentinel/default, matching real backend backfill behavior (SESSION-5).
  capacity: 9999,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: true, // pre-existing fixture — same backfill reasoning as mockSession above.
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-21T10:00:00',
  updatedAt: '2026-06-21T10:00:00',
};

// A group-linked session for mockOwnedGroup (id 3, Pickleball, currentUserRole
// group_owner) — gives the Home Feed rail's default 3-session fixture set
// (Badminton/mockGroupSession, Pickleball/mockSession, Pickleball/this one)
// so home-feed-journey.spec.ts's rail assertions keep holding without that
// spec seeding its own session state. SPORT-3: with only 2 real sports,
// mockSession and this fixture now share Pickleball (the old 3-distinct-
// sports premise, one per fixture, isn't representable anymore) — see that
// spec's own updated counts.
export const mockOwnedGroupSession: Session = {
  id: 3,
  groupId: mockOwnedGroup.id,
  sessionType: 'GROUP_RECURRING',
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  sportId: mockOwnedGroup.sportId,
  sportName: 'Pickleball',
  title: 'Ladder night',
  description: null,
  location: { ...mockLocation, id: 3, sportId: mockOwnedGroup.sportId, sportName: 'Pickleball' },
  locationNote: null,
  scheduledStart: '2026-08-03T19:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 4,
  // Same GROUP_RECURRING sentinel reasoning as mockGroupSession above.
  capacity: 9999,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: true, // pre-existing fixture — same backfill reasoning as mockSession above.
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-22T10:00:00',
  updatedAt: '2026-06-22T10:00:00',
};

// CLIENT-SESSION-4: a pre-seeded REQUESTED row on mockOwnedGroupSession (mockUser is group_owner
// there, so canManage is true) — same "pre-seed the other person's row, don't try to simulate a
// second live browser identity" precedent as mockGroupJoinRequest above. Exercises the approval
// queue without needing a second authenticated session.
export const mockSessionJoinRequest: SessionParticipant = {
  id: 1,
  sessionId: mockOwnedGroupSession.id,
  userId: '33333333-3333-4333-8333-333333333333',
  userFullName: 'Alex Chen',
  userAvatarUrl: null,
  status: 'REQUESTED',
  rejectReason: null,
  createdAt: '2026-07-17T00:00:00',
};

/** A second pre-seeded REQUESTED row on the same session, so the e2e journey can exercise both
 * Approve (on `mockSessionJoinRequest`) and Reject without needing a third fixture. */
export const mockSecondSessionJoinRequest: SessionParticipant = {
  id: 2,
  sessionId: mockOwnedGroupSession.id,
  userId: '44444444-4444-4444-8444-444444444444',
  userFullName: 'Morgan Diaz',
  userAvatarUrl: null,
  status: 'REQUESTED',
  rejectReason: null,
  createdAt: '2026-07-17T00:05:00',
};

// CLIENT-SESSION-6: a standalone session created by someone other than mockUser, for a sport
// mockUser holds an active profile for (Badminton, sportId 1) and hasn't joined — the only fixture
// eligible for GET /api/sessions/discover (mockSession is self-created; mockGroupSession/
// mockOwnedGroupSession are GROUP_RECURRING, and discover is standalone-only). Without this,
// discover would be permanently empty in every e2e run, since nothing else in this file matches
// its exclusion rules.
export const mockDiscoverableSession: Session = {
  id: 4,
  groupId: null,
  sessionType: 'STANDALONE',
  createdBy: 'other-user-id',
  createdByFullName: 'Priya Shah',
  sportId: 1,
  sportName: 'Badminton',
  title: 'Weekend 5-a-side',
  description: 'Open pickup game, all welcome.',
  location: { ...mockLocation, id: 4, sportId: 1, sportName: 'Badminton', name: 'Central Turf Park' },
  locationNote: null,
  scheduledStart: '2026-08-06T18:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 4,
  capacity: 10,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: true,
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-23T10:00:00',
  updatedAt: '2026-06-23T10:00:00',
};

// CLIENT-SESSION-12: group-linked to mockGroup (mockUser is already group_member there, so it
// surfaces in "My sessions" via the group-sessions path regardless of participant status —
// GET /sessions/group/:groupId has no status filter, unlike /sessions/mine or the JOINED-only
// joined-sessions query). Created by someone else, with mockUser pre-seeded INVITED — this mock
// backend has no second live identity to actually invite as, same "pre-seed the other person's
// row" precedent as mockSessionJoinRequest.
export const mockInvitedSession: Session = {
  id: 5,
  groupId: mockGroup.id,
  sessionType: 'GROUP_RECURRING',
  createdBy: 'other-user-id',
  createdByFullName: 'Priya Shah',
  sportId: mockGroup.sportId,
  sportName: 'Badminton',
  title: 'Tuesday drop-in',
  description: null,
  location: { ...mockLocation, id: 5, sportId: mockGroup.sportId, sportName: 'Badminton' },
  locationNote: null,
  scheduledStart: '2026-08-04T19:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 5,
  capacity: 9999,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: true,
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-24T10:00:00',
  updatedAt: '2026-06-24T10:00:00',
};

/** mockUser's own pre-seeded INVITED row on mockInvitedSession — same reasoning as
 * mockSessionJoinRequest, just for the invitee's own view instead of the owner's queue. */
export const mockUserInvitedRow: SessionParticipant = {
  id: 3,
  sessionId: mockInvitedSession.id,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: mockUser.avatarUrl,
  status: 'INVITED',
  rejectReason: null,
  createdAt: '2026-07-18T00:00:00',
};

// CLIENT-SESSION-12: same shape as mockInvitedSession, for the REQUESTED (pending organizer
// approval) caller-side state instead.
export const mockRequestedSession: Session = {
  id: 6,
  groupId: mockGroup.id,
  sessionType: 'GROUP_RECURRING',
  createdBy: 'other-user-id',
  createdByFullName: 'Priya Shah',
  sportId: mockGroup.sportId,
  sportName: 'Badminton',
  title: 'Wednesday scrimmage',
  description: null,
  location: { ...mockLocation, id: 6, sportId: mockGroup.sportId, sportName: 'Badminton' },
  locationNote: null,
  scheduledStart: '2026-08-05T19:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 5,
  capacity: 9999,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: false, // must stay false — an autoApprove join instantly resolves to JOINED, never REQUESTED.
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-25T10:00:00',
  updatedAt: '2026-06-25T10:00:00',
};

/** mockUser's own pre-seeded REQUESTED row on mockRequestedSession. */
export const mockUserRequestedRow: SessionParticipant = {
  id: 4,
  sessionId: mockRequestedSession.id,
  userId: mockUser.id,
  userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  userAvatarUrl: mockUser.avatarUrl,
  status: 'REQUESTED',
  rejectReason: null,
  createdAt: '2026-07-19T00:00:00',
};

// CLIENT-SESSION-12: standalone + createdBy mockUser, so it surfaces via /sessions/mine (which
// filters on groupId===null && createdBy===mockUser.id only, no status filter) without needing a
// live cancel action — SessionDetailModal's Cancel session button was removed entirely
// (CLIENT-SESSION-10), so there is no UI path left to reach a CANCELLED session from a fresh
// SCHEDULED one; this fixture starts pre-cancelled instead.
export const mockCancelledSession: Session = {
  id: 7,
  groupId: null,
  sessionType: 'STANDALONE',
  createdBy: mockUser.id,
  createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  sportId: 3,
  sportName: 'Pickleball',
  title: 'Monday night run',
  description: null,
  location: { ...mockLocation, id: 7, sportId: 3, sportName: 'Pickleball' },
  locationNote: null,
  scheduledStart: '2026-08-07T19:00:00', // fixed — see mockSession's note on hoursFromNow()
  scheduledEndAt: null,
  status: 'CANCELLED',
  cancelReason: 'Court unavailable due to maintenance.',
  cancelledBy: mockUser.id,
  cancelledByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
  cancelledAt: '2026-07-20T09:00:00',
  participantCount: 0,
  capacity: 10,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: true,
  likeCount: 0,
  isLikedByCurrentUser: false,
  callerParticipation: null, // overwritten per-response — see mockSession's note above.
  createdAt: '2026-06-26T10:00:00',
  updatedAt: '2026-06-26T10:00:00',
};

/** Builds a Spring Data `Page<T>`-shaped response from a full content array. */
export function mockPageResponse<T>(content: T[]): PageResponse<T> {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: Math.max(content.length, 20),
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

/**
 * Gets a spec's page into an authenticated state on `targetPath` (default
 * `/`), before that route (behind ProtectedRoute, AUTH-4) is asserted on.
 * AUTH-3's useSessionBootstrap fires POST /auth/refresh on every app mount,
 * so any protected route needs a valid session established first.
 *
 * Drives the real LoginForm rather than a raw `fetch()` or
 * `context.addCookies()` — go to `targetPath` directly while logged out.
 * ProtectedRoute redirects to /login carrying `targetPath` as the
 * redirect-back target. Then log in through the UI: `useLogin`'s
 * `onSuccess` calls `authStore.setSession()` directly in memory and
 * navigates back to `targetPath` via React Router's `navigate()` — an
 * in-app transition, not a reload.
 *
 * MSW-1: the mock server is a real listening process (no per-navigation
 * setup handshake), so there's no readiness race left to work around here —
 * this function no longer needs `page.evaluate('window.__mswReady')` before
 * interacting with the login form, unlike the old Service-Worker version.
 * `Set-Cookie` on a successful login is now a genuine response header the
 * browser's own cookie jar applies, so the session also survives a reload
 * from this point on (see the new reload-persistence test in
 * auth-journey.spec.ts) — no separate cookie-mirroring step needed.
 *
 * Must be called with a page from the mock-server-wired `test` in `test.ts`.
 */
export async function seedAuthenticatedSession(page: Page, targetPath = '/'): Promise<void> {
  await page.goto(targetPath);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await page.getByLabel('Email', { exact: true }).fill(mockUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(
    (url) => url.pathname + url.search === targetPath || (targetPath === '/' && url.pathname === '/'),
    { timeout: 10000 },
  );
}

/**
 * MSW-1: posts to the mock server's admin API (`/__mock/sessions/:id/...`)
 * — replaces the old `page.addInitScript` + dynamic-import +
 * `worker.use()` mechanism every `simulate*OnNextLoad`/`seed*OnNextLoad`
 * helper below used. Plain Node-side HTTP calls now, no browser JS
 * injection: call before `page.goto()`/`page.reload()` (or mid-test, for
 * `simulateCreatePostFailOnce`, which fires on the *next* matching request
 * regardless of navigation) with the test's `mockSessionId` (from `test.ts`'s
 * fixture) — the header that same id travels on is what ties a page's
 * requests back to this override.
 */
async function postAdmin(sessionId: string, path: string): Promise<void> {
  const response = await fetch(
    `${MOCK_SERVER_URL}/__mock/sessions/${encodeURIComponent(sessionId)}/${path}`,
    { method: 'POST' },
  );
  if (!response.ok) {
    throw new Error(`Mock server admin call failed: POST ${path} -> ${response.status}`);
  }
}

/**
 * Simulates a refresh token that was valid at login but revoked/expired
 * server-side sometime after (AUTH-8's step 6 scenario). Call this, then
 * trigger the request that should hit the expired session (a navigation, or
 * an already-mounted page's own retry), to simulate the scenario.
 */
export async function simulateExpiredSessionOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/refreshExpired');
}

/**
 * For FEED-1's visual-regression empty state — HF-10b's own delta said to
 * replace the old `?visual-state=empty` seam (removed from
 * useHomeFeedData) with an MSW override once the feed went real. Call this,
 * then navigate; the next `GET /posts/feed` for this session returns zero
 * posts.
 */
export async function seedEmptyFeedOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/feedEmpty');
}

/**
 * FEED-10 step 1: seeds a genuinely paginated `GET /posts/feed` (21 posts,
 * real `page`/`size` handling) — lets the "Load more" journey step fetch a
 * real second page instead of a single-page fixture that always fits.
 */
export async function seedPaginatedFeedOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-paginated-feed');
}

/**
 * FEED-10's SPORT-1 delta step — for a user with zero sport profiles
 * (rather than the primary fixture user's 3-sport cap, needed elsewhere in
 * the same journey). GRP-8: also clears the real underlying session state
 * (`seedZeroSportProfilesState` in mockServer.ts's admin route), not just
 * the GET response — needed for tests that also POST a new profile
 * afterward (e.g. GRP-8's sport-add-on-accept flow), which would otherwise
 * 400 against the still-full default fixture underneath.
 */
export async function seedZeroSportProfilesOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/sportProfilesEmpty');
}

/**
 * SPORT-10 — gives the caller a soft-deleted Pickleball profile (prev skill
 * `advanced` / 6y). `GET /sports/profiles?includeInactive=true` then returns
 * it, so the add-sport picker (and the Profile-page `SportSwitcher`'s muted
 * pill) offer the read-only "Reactivate" flow.
 */
export async function seedSoftDeletedSportProfileOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-soft-deleted-sport-profile');
}

/**
 * GRP-8 part 3 — seeds `mockJoinRequest` (the test user's own pending
 * request against `mockPublicGroup`) directly into session state, rather
 * than driving JoinGroupModal's search UI (no existing e2e coverage to
 * build on for that flow) — same "seed state directly" shape as
 * `seedPaginatedFeedOnNextLoad`.
 */
export async function seedJoinRequestOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-join-requests');
}

/**
 * CLIENT-NOTIF-2's empty-bell-dropdown baseline — same `override/*Empty`
 * shape as `seedEmptyFeedOnNextLoad`. Call before `seedAuthenticatedSession`;
 * the next `GET /api/notifications`/`GET /api/notifications/unread-count`
 * for this session both return empty/zero.
 */
export async function seedEmptyNotificationsOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/notificationsEmpty');
}

/**
 * CLIENT-NOTIF-2's with-load-more baseline — 11 notifications (one more than
 * the list's page size of 10), same shape as `seedPaginatedFeedOnNextLoad`.
 */
export async function seedPaginatedNotificationsOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-paginated-notifications');
}

/**
 * CLIENT-NOTIF-5 — replaces this session's notification list with a single
 * unread `user.friend_request.created` whose `entityId` matches no
 * friend/request row (and 404s from `GET /api/users/{id}`). Clicking it routes
 * to `/friends` and opens the "Friend request unavailable" dialog instead of
 * pre-selecting anyone.
 */
export async function seedUnavailableFriendRequestNotification(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-unavailable-friend-request-notification');
}

/**
 * FRIEND-2: an unread `user.friend_request.accepted` ("… is now your friend")
 * whose `entityId` matches no friend/request row — the counterparty accepted
 * then unfriended since. Clicking it routes to `/friends` but must NOT open the
 * "unavailable" dialog (that copy is for a missing *request*, and an accepted
 * notification carries none).
 */
export async function seedStaleAcceptedFriendNotification(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'seed-stale-accepted-friend-notification');
}

/**
 * FEED-8 error-simulation helpers — one per real-data surface FEED-8
 * hardened. Call before `page.goto()`; the next matching request for this
 * session returns a 500, so the real query's `isError` (or, for the feed's
 * pagination-edge case, `isFetchNextPageError` once a first successful page
 * is already loaded) flips and the corresponding error+retry UI renders.
 * FEED-10's E2E journey is the intended consumer.
 */
export async function simulateFeedErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/feedError');
}

export async function simulateTrendingErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/trendingError');
}

export async function simulateBroadcastsErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/broadcastsError');
}

export async function simulateGroupsErrorOnNextLoad(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/groupsError');
}

/**
 * FEED-10's required "at least one MSW-simulated error response" — a
 * one-time failure on the next `POST /posts` for this session (consumed on
 * read, see overrides.ts's `consumeCreatePostFailOnce`): a retry with the
 * same content succeeds normally. MSW-1: replaces failCreatePostOnce.ts's
 * `overrideCreatePostToFailOnce`, previously invoked via
 * `page.evaluate` against `window.__mswWorker` directly since the failure
 * needed to apply mid-test, not on next navigation — now a plain admin call,
 * which works identically whether called before or mid-test since it
 * doesn't depend on a navigation at all.
 */
export async function simulateCreatePostFailOnce(sessionId: string): Promise<void> {
  await postAdmin(sessionId, 'override/createPostFailOnce');
}

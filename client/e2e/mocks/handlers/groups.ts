import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  CreateGroupPayload,
  CreateInvitationPayload,
  Group,
  GroupInfo,
  GroupInvitation,
  GroupMember,
  GroupSearchResult,
  GroupSettings,
  JoinRequest,
  JoinRequestPayload,
  UpdateGroupPayload,
  UpdateGroupSettingsPayload,
} from '../../../src/features/feed/types.ts';
import {
  mockFriend,
  mockGroup,
  mockGroupInfo,
  mockGroupJoinRequest,
  mockGroupMembers,
  mockGroupSettings,
  mockOwnedGroup,
  mockPageResponse,
  mockPublicGroup,
  mockSentInvitation,
  mockUser,
} from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

function apiResponse<T>(data: T, message = 'Success'): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

function apiError(message: string): ApiResponse<null> {
  return { success: false, message, data: null, timestamp: new Date().toISOString() };
}

function requireAuth(request: Request): Response | null {
  if (!request.headers.get('Authorization')) {
    return HttpResponse.json(apiError('Unauthorized'), { status: 401 });
  }
  return null;
}

interface GroupsSession {
  userGroupsState: Group[];
  publicGroupsState: GroupSearchResult[];
  joinRequestsState: JoinRequest[];
  // GRP-2: keyed by groupId — only mockOwnedGroup has a real fixture entry;
  // any other groupId 404s (no group-settings row for a group that isn't
  // part of this session's fixtures).
  groupSettingsState: Record<number, GroupSettings>;
  // GRP-2: rules/schedule, same keying reasoning as groupSettingsState.
  groupInfoState: Record<number, GroupInfo>;
  // GRP-3: the group-scoped roster/queues Members tab reads — same
  // "only mockOwnedGroup has fixture rows" keying as groupSettingsState.
  groupMembersState: Record<number, GroupMember[]>;
  groupJoinRequestsState: Record<number, JoinRequest[]>;
  sentInvitationsState: Record<number, GroupInvitation[]>;
  nextGroupId: number;
  nextJoinRequestId: number;
  nextMemberId: number;
  nextInvitationId: number;
}

// GRP-4: resolves a search result's id -> display name for a freshly created
// invitation's `inviteeFullName` (the POST body only carries `inviteeId`).
// Same small-dictionary reasoning as friends.ts's KNOWN_USERS — only needs
// to cover ids this mock's own /users/search handler (friends.ts, reused
// as-is for GRP-4) can actually return with `friendshipStatus: 'FRIENDS'`,
// since GRP-4's client drops every non-friend row before an invite is
// reachable at all.
const KNOWN_INVITEE_NAMES: Record<string, string> = {
  [mockFriend.id]: mockFriend.fullName,
};

// FEED-5's own small stateful fake backend, same "not a fixed responder"
// reasoning as feed.ts's postsState — a created group must actually appear
// in a later GET /groups/user/:userId (useCreateGroup's onSuccess cache
// write already handles this client-side, but useUserGroups' background
// invalidate+refetch would otherwise clobber it if this were static).
function defaultGroupsSession(): GroupsSession {
  return {
    userGroupsState: [mockGroup, mockOwnedGroup],
    publicGroupsState: [
      { ...mockGroup, description: mockGroup.description, isMember: true } as unknown as GroupSearchResult,
      mockPublicGroup,
    ],
    joinRequestsState: [],
    groupSettingsState: { [mockOwnedGroup.id]: { ...mockGroupSettings } },
    groupInfoState: { [mockOwnedGroup.id]: { ...mockGroupInfo } },
    groupMembersState: { [mockOwnedGroup.id]: mockGroupMembers.map((member) => ({ ...member })) },
    groupJoinRequestsState: { [mockOwnedGroup.id]: [{ ...mockGroupJoinRequest }] },
    sentInvitationsState: { [mockOwnedGroup.id]: [{ ...mockSentInvitation }] },
    nextGroupId: 100,
    nextJoinRequestId: 100,
    nextMemberId: 100,
    nextInvitationId: 100,
  };
}

// MSW-1: session-keyed, same reasoning as feed.ts's feedSessions.
const groupsSessions = createSessionStore(defaultGroupsSession);

export const groupHandlers: HttpHandler[] = [
  // Moved from feed.ts (FEED-5) — now stateful (userGroupsState) so a group
  // created via POST /groups actually appears on refetch. A static handler
  // would otherwise clobber useCreateGroup's optimistic cache write the
  // moment its onSettled background invalidate refires this GET.
  http.get('/api/groups/user/:userId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    // MSW-1: replaces apiErrors.ts's overrideGroupsToError.
    if (getOverrides(sessionId).groupsError) {
      return HttpResponse.json(apiError('Simulated groups failure'), { status: 500 });
    }
    return HttpResponse.json(
      apiResponse(mockPageResponse(groupsSessions.get(sessionId).userGroupsState), 'Groups retrieved successfully'),
    );
  }),

  http.post('/api/groups', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as CreateGroupPayload;
    if (!body.groupName || body.sportId === undefined) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const created: Group = {
      id: session.nextGroupId++,
      sportId: body.sportId,
      groupName: body.groupName,
      description: body.description ?? null,
      avatarUrl: null,
      coverUrl: null,
      isPrivate: body.isPrivate,
      isActive: true,
      createdBy: mockUser.id,
      createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      memberCount: 1,
      currentUserRole: 'group_owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinnedPosts: null,
    };
    session.userGroupsState = [created, ...session.userGroupsState];
    session.publicGroupsState = [
      { ...created, isMember: true } as unknown as GroupSearchResult,
      ...session.publicGroupsState,
    ];
    return HttpResponse.json(apiResponse(created, 'Group created successfully'), { status: 201 });
  }),

  http.get('/api/groups/public', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const sportId = url.searchParams.get('sportId');
    const keyword = url.searchParams.get('keyword');
    let results = groupsSessions.get(sessionIdFromRequest(request)).publicGroupsState;
    if (sportId !== null) {
      results = results.filter((group) => group.sportId === Number(sportId));
    }
    if (keyword !== null && keyword !== '') {
      results = results.filter((group) =>
        group.groupName.toLowerCase().includes(keyword.toLowerCase()),
      );
    }
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Groups retrieved successfully'));
  }),

  http.post('/api/groups/join-requests', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as JoinRequestPayload;
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const targetGroup = session.publicGroupsState.find((group) => group.groupName === body.groupName);
    if (!targetGroup) {
      return HttpResponse.json(apiError('Group not found'), { status: 404 });
    }
    const alreadyPending = session.joinRequestsState.some(
      (request_) => request_.groupId === targetGroup.id && request_.status === 'pending',
    );
    if (alreadyPending) {
      return HttpResponse.json(apiError('A pending request already exists'), { status: 400 });
    }
    const created: JoinRequest = {
      id: session.nextJoinRequestId++,
      groupId: targetGroup.id,
      groupName: targetGroup.groupName,
      userId: mockUser.id,
      userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      userAvatarUrl: null,
      status: 'pending',
      message: body.message ?? null,
      reviewedBy: null,
      reviewedByFullName: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.joinRequestsState = [created, ...session.joinRequestsState];
    return HttpResponse.json(apiResponse(created, 'Join request created successfully'), {
      status: 201,
    });
  }),

  http.get('/api/groups/join-requests/user/:userId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const pending = groupsSessions
      .get(sessionIdFromRequest(request))
      .joinRequestsState.filter((request_) => request_.status === 'pending');
    return HttpResponse.json(
      apiResponse(mockPageResponse(pending), 'Join requests retrieved successfully'),
    );
  }),

  // GRP-1/GRP-2: Privacy toggle and rules/schedule both go through this same
  // endpoint. No handler existed for it before GRP-2 — Privacy's own e2e
  // coverage never exercised a real PUT call until this ticket added one.
  http.put('/api/groups/:groupId', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const existingGroup = session.userGroupsState.find((candidate) => candidate.id === groupId);
    if (!existingGroup) {
      return HttpResponse.json(apiError('Group not found'), { status: 404 });
    }
    const body = (await request.json()) as UpdateGroupPayload;
    const updatedGroup: Group = {
      ...existingGroup,
      ...(body.groupName !== undefined ? { groupName: body.groupName } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl } : {}),
      ...(body.isPrivate !== undefined ? { isPrivate: body.isPrivate } : {}),
      updatedAt: new Date().toISOString(),
    };
    session.userGroupsState = session.userGroupsState.map((candidate) =>
      candidate.id === groupId ? updatedGroup : candidate,
    );
    // rules/schedule aren't part of GroupResponse but are persisted
    // server-side — update groupInfoState too so a later GET .../info
    // reflects them, matching the real backend's behavior.
    const existingInfo = session.groupInfoState[groupId];
    if (existingInfo && (body.rules !== undefined || body.schedule !== undefined)) {
      session.groupInfoState[groupId] = {
        ...existingInfo,
        ...(body.rules !== undefined ? { rules: body.rules } : {}),
        ...(body.schedule !== undefined ? { schedule: body.schedule } : {}),
        updatedAt: new Date().toISOString(),
      };
    }
    return HttpResponse.json(apiResponse(updatedGroup, 'Group updated successfully'));
  }),

  // GRP-2
  http.get('/api/groups/:groupId/info', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const info = groupsSessions.get(sessionIdFromRequest(request)).groupInfoState[groupId];
    if (!info) {
      return HttpResponse.json(apiError('Group not found'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(info, 'Info retrieved successfully'));
  }),

  http.get('/api/groups/:groupId/settings', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const settings = groupsSessions.get(sessionIdFromRequest(request)).groupSettingsState[groupId];
    if (!settings) {
      return HttpResponse.json(apiError('Group settings not found'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(settings, 'Settings retrieved successfully'));
  }),

  http.put('/api/groups/:groupId/settings', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const existing = session.groupSettingsState[groupId];
    if (!existing) {
      return HttpResponse.json(apiError('Group settings not found'), { status: 404 });
    }
    const body = (await request.json()) as UpdateGroupSettingsPayload;
    const updated: GroupSettings = {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    session.groupSettingsState[groupId] = updated;
    return HttpResponse.json(apiResponse(updated, 'Settings updated successfully'));
  }),

  // GRP-3
  http.get('/api/groups/:groupId/members', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const members = groupsSessions.get(sessionIdFromRequest(request)).groupMembersState[groupId] ?? [];
    return HttpResponse.json(apiResponse(mockPageResponse(members), 'Members retrieved successfully'));
  }),

  http.get('/api/groups/:groupId/join-requests', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const requests =
      groupsSessions.get(sessionIdFromRequest(request)).groupJoinRequestsState[groupId] ?? [];
    return HttpResponse.json(
      apiResponse(mockPageResponse(requests), 'Join requests retrieved successfully'),
    );
  }),

  http.get('/api/groups/:groupId/invitations/sent', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const invitations =
      groupsSessions.get(sessionIdFromRequest(request)).sentInvitationsState[groupId] ?? [];
    return HttpResponse.json(
      apiResponse(mockPageResponse(invitations), 'Sent invitations retrieved successfully'),
    );
  }),

  // GRP-4. The real backend's not-friends/allowMemberInvites-off 400s aren't
  // simulated here — GRP-4's client already filters non-friend search
  // results out before an invite can ever be attempted, so an e2e journey
  // never reaches those paths. Already-a-member and the idempotent
  // already-invited case ARE simulated, since a search result can't rule
  // those out client-side (U6 doesn't filter by group).
  http.post('/api/groups/:groupId/invitations', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const body = (await request.json()) as CreateInvitationPayload;
    if (!body.inviteeId) {
      return HttpResponse.json(apiError('Invitee ID is required'), { status: 400 });
    }
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const isAlreadyMember = (session.groupMembersState[groupId] ?? []).some(
      (member) => member.userId === body.inviteeId,
    );
    if (isAlreadyMember) {
      return HttpResponse.json(apiError('User is already a member of this group'), { status: 400 });
    }
    const existing = (session.sentInvitationsState[groupId] ?? []).find(
      (invitation) => invitation.inviteeId === body.inviteeId,
    );
    if (existing) {
      return HttpResponse.json(apiResponse(existing, 'Invitation sent successfully'), { status: 201 });
    }
    const group = session.userGroupsState.find((candidate) => candidate.id === groupId);
    const created: GroupInvitation = {
      id: session.nextInvitationId++,
      groupId,
      groupName: group?.groupName ?? 'Group',
      inviterId: mockUser.id,
      inviterFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      inviteeId: body.inviteeId,
      inviteeFullName: KNOWN_INVITEE_NAMES[body.inviteeId] ?? 'New Friend',
      status: 'pending_owner',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.sentInvitationsState[groupId] = [...(session.sentInvitationsState[groupId] ?? []), created];
    return HttpResponse.json(apiResponse(created, 'Invitation sent successfully'), { status: 201 });
  }),

  // GRP-3: accept moves the request out of its group's pending queue and
  // appends a new group_member row (matching the real backend's
  // addMember-on-accept behavior) — searches every group's queue for the
  // requestId rather than taking a groupId, same as the real
  // /join-requests/{requestId}/accept endpoint (requestId alone identifies
  // the group).
  http.put('/api/groups/join-requests/:requestId/accept', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const requestId = Number(params.requestId);
    const session = groupsSessions.get(sessionIdFromRequest(request));
    const groupId = Object.keys(session.groupJoinRequestsState)
      .map(Number)
      .find((id) => session.groupJoinRequestsState[id].some((req) => req.id === requestId));
    if (groupId === undefined) {
      return HttpResponse.json(apiError('Request not found'), { status: 404 });
    }
    const acceptedRequest = session.groupJoinRequestsState[groupId].find((req) => req.id === requestId)!;
    session.groupJoinRequestsState[groupId] = session.groupJoinRequestsState[groupId].filter(
      (req) => req.id !== requestId,
    );
    const newMember: GroupMember = {
      id: session.nextMemberId++,
      groupId,
      userId: acceptedRequest.userId,
      userFullName: acceptedRequest.userFullName,
      userAvatarUrl: acceptedRequest.userAvatarUrl,
      roleId: 3,
      roleName: 'group_member',
      roleLevel: 1,
      joinedAt: new Date().toISOString(),
    };
    session.groupMembersState[groupId] = [...(session.groupMembersState[groupId] ?? []), newMember];
    return HttpResponse.json(apiResponse(null, 'Join request accepted'));
  }),

  http.put('/api/groups/join-requests/:requestId/decline', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const requestId = Number(params.requestId);
    const session = groupsSessions.get(sessionIdFromRequest(request));
    for (const groupId of Object.keys(session.groupJoinRequestsState).map(Number)) {
      session.groupJoinRequestsState[groupId] = session.groupJoinRequestsState[groupId].filter(
        (req) => req.id !== requestId,
      );
    }
    return HttpResponse.json(apiResponse(null, 'Join request declined'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetGroupHandlersState(sessionId: string): void {
  groupsSessions.reset(sessionId);
}

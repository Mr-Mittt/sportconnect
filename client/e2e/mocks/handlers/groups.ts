import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  CreateGroupPayload,
  Group,
  GroupSearchResult,
  GroupSettings,
  JoinRequest,
  JoinRequestPayload,
  UpdateGroupSettingsPayload,
} from '../../../src/features/feed/types.ts';
import {
  mockGroup,
  mockGroupSettings,
  mockOwnedGroup,
  mockPageResponse,
  mockPublicGroup,
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
  nextGroupId: number;
  nextJoinRequestId: number;
}

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
    nextGroupId: 100,
    nextJoinRequestId: 100,
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

  // GRP-2
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
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetGroupHandlersState(sessionId: string): void {
  groupsSessions.reset(sessionId);
}

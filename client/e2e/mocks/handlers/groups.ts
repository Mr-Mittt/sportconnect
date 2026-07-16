import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type {
  CreateGroupPayload,
  Group,
  GroupSearchResult,
  JoinRequest,
  JoinRequestPayload,
} from '../../../src/features/feed/types.ts';
import { mockGroup, mockOwnedGroup, mockPageResponse, mockPublicGroup, mockUser } from '../fixtures.ts';

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

// FEED-5's own small stateful fake backend, same "not a fixed responder"
// reasoning as feed.ts's postsState — a created group must actually appear
// in a later GET /groups/user/:userId (useCreateGroup's onSuccess cache
// write already handles this client-side, but useUserGroups' background
// invalidate+refetch would otherwise clobber it if this were static).
let userGroupsState: Group[] = [mockGroup, mockOwnedGroup];
let publicGroupsState: GroupSearchResult[] = [
  { ...mockGroup, description: mockGroup.description, isMember: true } as unknown as GroupSearchResult,
  mockPublicGroup,
];
let joinRequestsState: JoinRequest[] = [];
let nextGroupId = 100;
let nextJoinRequestId = 100;

export const groupHandlers: HttpHandler[] = [
  // Moved from feed.ts (FEED-5) — now stateful (userGroupsState) so a group
  // created via POST /groups actually appears on refetch. A static handler
  // would otherwise clobber useCreateGroup's optimistic cache write the
  // moment its onSettled background invalidate refires this GET.
  http.get('/api/groups/user/:userId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    return HttpResponse.json(
      apiResponse(mockPageResponse(userGroupsState), 'Groups retrieved successfully'),
    );
  }),

  http.post('/api/groups', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as CreateGroupPayload;
    if (!body.groupName || body.sportId === undefined) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const created: Group = {
      id: nextGroupId++,
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
    userGroupsState = [created, ...userGroupsState];
    publicGroupsState = [
      { ...created, isMember: true } as unknown as GroupSearchResult,
      ...publicGroupsState,
    ];
    return HttpResponse.json(apiResponse(created, 'Group created successfully'), { status: 201 });
  }),

  http.get('/api/groups/public', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const sportId = url.searchParams.get('sportId');
    const keyword = url.searchParams.get('keyword');
    let results = publicGroupsState;
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
    const targetGroup = publicGroupsState.find((group) => group.groupName === body.groupName);
    if (!targetGroup) {
      return HttpResponse.json(apiError('Group not found'), { status: 404 });
    }
    const alreadyPending = joinRequestsState.some(
      (request_) => request_.groupId === targetGroup.id && request_.status === 'pending',
    );
    if (alreadyPending) {
      return HttpResponse.json(apiError('A pending request already exists'), { status: 400 });
    }
    const created: JoinRequest = {
      id: nextJoinRequestId++,
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
    joinRequestsState = [created, ...joinRequestsState];
    return HttpResponse.json(apiResponse(created, 'Join request created successfully'), {
      status: 201,
    });
  }),

  http.get('/api/groups/join-requests/user/:userId', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const pending = joinRequestsState.filter((request_) => request_.status === 'pending');
    return HttpResponse.json(
      apiResponse(mockPageResponse(pending), 'Join requests retrieved successfully'),
    );
  }),
];

/** Test-only reset — mirrors feed.ts's implicit per-module-load reset (no
 * explicit reset export there since its state doesn't need cross-test
 * isolation the way join-request "already pending" business logic does). */
export function resetGroupHandlersState(): void {
  userGroupsState = [mockGroup];
  publicGroupsState = [
    { ...mockGroup, description: mockGroup.description, isMember: true } as unknown as GroupSearchResult,
    mockPublicGroup,
  ];
  joinRequestsState = [];
}

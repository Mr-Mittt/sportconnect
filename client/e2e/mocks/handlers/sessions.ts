import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { ParticipantStatus, Session, SessionParticipant } from '../../../src/shared/types/session.ts';
import {
  mockFriend,
  mockGroupSession,
  mockLocation,
  mockOwnedGroupSession,
  mockSecondSessionJoinRequest,
  mockSession,
  mockSessionJoinRequest,
  mockUser,
} from '../fixtures.ts';
import { createSessionStore, sessionIdFromRequest } from '../sessionStore.ts';

// CLIENT-SESSION-4: the only invitee identity this mock backend knows by id — same reasoning as
// groups.ts's own `[mockFriend.id]: mockFriend.fullName` map for invited-member display names.
const KNOWN_USER_NAMES: Record<string, string> = {
  [mockFriend.id]: mockFriend.fullName,
};

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

function mockPageResponse<T>(content: T[]) {
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

interface SessionsSession {
  sessionsState: Session[];
  participantsState: Record<number, SessionParticipant[]>;
  nextSessionId: number;
  nextParticipantId: number;
}

// CLIENT-SESSION-1's own stateful fake backend, same "not a fixed responder"
// reasoning as groups.ts/sport.ts — a created session must actually appear
// in a later GET /sessions/mine, and join/leave/cancel must actually mutate
// state a later GET re-reads (useCreateSession/useJoinSession/etc.'s own
// invalidateQueries would otherwise clobber a static fixture on refetch).
function defaultSessionsSession(): SessionsSession {
  return {
    sessionsState: [{ ...mockSession }, { ...mockGroupSession }, { ...mockOwnedGroupSession }],
    // CLIENT-SESSION-4: mockOwnedGroupSession (mockUser is group_owner) starts with one
    // pre-seeded REQUESTED row, so the approval queue has something to show without needing a
    // second live authenticated session.
    participantsState: {
      [mockOwnedGroupSession.id]: [{ ...mockSessionJoinRequest }, { ...mockSecondSessionJoinRequest }],
    },
    nextSessionId: 100,
    nextParticipantId: 100,
  };
}

const sessionsSessions = createSessionStore(defaultSessionsSession);

export const sessionHandlers: HttpHandler[] = [
  http.post('/api/sessions', async ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      groupId?: number;
      sportId?: number;
      title?: string;
      description?: string;
      locationId: number;
      locationNote?: string;
      scheduledStart: string;
      durationMinutes?: number;
      capacity: number;
      feeType: Session['feeType'];
      feeAmountVnd?: number;
      initialSlot?: number;
      autoApprove?: boolean;
      inviteeIds?: string[];
    };
    if (!body.locationId || !body.scheduledStart || body.capacity === undefined || !body.feeType) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const initialSlot = body.initialSlot ?? 0;
    const created: Session = {
      id: session.nextSessionId++,
      groupId: body.groupId ?? null,
      sessionType: body.groupId !== undefined ? 'GROUP_RECURRING' : 'STANDALONE',
      createdBy: mockUser.id,
      createdByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      sportId: body.sportId ?? mockLocation.sportId,
      sportName: mockLocation.sportName,
      title: body.title ?? null,
      description: body.description ?? null,
      location: mockLocation,
      locationNote: body.locationNote ?? null,
      scheduledStart: body.scheduledStart,
      scheduledEndAt: null,
      status: 'SCHEDULED',
      cancelReason: null,
      cancelledBy: null,
      cancelledByFullName: null,
      cancelledAt: null,
      // Real backend: participantCount = real JOINED rows + initialSlot. This mock doesn't
      // simulate the creator auto-joining on create (a pre-existing gap, out of scope here), so
      // the real-JOINED-rows half stays 0 — initialSlot is the only real addition this ticket makes.
      participantCount: initialSlot,
      capacity: body.capacity,
      feeType: body.feeType,
      feeAmountVnd: body.feeType === 'FIXED' ? (body.feeAmountVnd ?? null) : null,
      initialSlot,
      autoApprove: body.autoApprove ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.sessionsState = [created, ...session.sessionsState];
    // SESSION-6: pre-create an INVITED row per deduped invitee id (excluding the creator's own),
    // resolved only by that user's own later joinSession call, which bypasses autoApprove entirely.
    const dedupedInviteeIds = [...new Set(body.inviteeIds ?? [])].filter((id) => id !== mockUser.id);
    if (dedupedInviteeIds.length > 0) {
      session.participantsState[created.id] = dedupedInviteeIds.map((inviteeId) => ({
        id: session.nextParticipantId++,
        sessionId: created.id,
        userId: inviteeId,
        userFullName: KNOWN_USER_NAMES[inviteeId] ?? 'Invited user',
        userAvatarUrl: null,
        status: 'INVITED',
        rejectReason: null,
        createdAt: new Date().toISOString(),
      }));
    }
    return HttpResponse.json(apiResponse(created, 'Session created successfully'), { status: 201 });
  }),

  http.get('/api/sessions/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const groupId = Number(params.groupId);
    const results = sessionsSessions
      .get(sessionIdFromRequest(request))
      .sessionsState.filter((candidate) => candidate.groupId === groupId);
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Sessions retrieved successfully'));
  }),

  http.get('/api/sessions/mine', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const results = sessionsSessions
      .get(sessionIdFromRequest(request))
      .sessionsState.filter((candidate) => candidate.groupId === null && candidate.createdBy === mockUser.id);
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Sessions retrieved successfully'));
  }),

  http.get('/api/sessions/:sessionId', ({ request, params }) => {
    const sessionId = Number(params.sessionId);
    const found = sessionsSessions
      .get(sessionIdFromRequest(request))
      .sessionsState.find((candidate) => candidate.id === sessionId);
    if (!found) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(found, 'Session retrieved successfully'));
  }),

  http.put('/api/sessions/:sessionId', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const existing = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!existing) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    const body = (await request.json()) as Partial<Session>;
    const updated: Session = { ...existing, ...body, updatedAt: new Date().toISOString() };
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId ? updated : candidate,
    );
    return HttpResponse.json(apiResponse(updated, 'Session updated successfully'));
  }),

  http.post('/api/sessions/:sessionId/cancel', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const existing = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!existing) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      return HttpResponse.json(apiError('Session already completed or cancelled'), { status: 400 });
    }
    const body = (request.headers.get('content-length') === '0' ? {} : await request.json().catch(() => ({}))) as {
      reason?: string;
    };
    const updated: Session = {
      ...existing,
      status: 'CANCELLED',
      cancelReason: body.reason ?? null,
      cancelledBy: mockUser.id,
      cancelledByFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId ? updated : candidate,
    );
    return HttpResponse.json(apiResponse(updated, 'Session cancelled successfully'));
  }),

  http.post('/api/sessions/:sessionId/join', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const existing = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!existing) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    const participants = session.participantsState[sessionId] ?? [];
    const alreadyJoined = participants.some((p) => p.userId === mockUser.id && p.status === 'JOINED');
    if (!alreadyJoined) {
      const existingRow = participants.find((p) => p.userId === mockUser.id);
      // SESSION-6: an INVITED row always bypasses autoApprove; otherwise autoApprove decides
      // between an instant JOINED and a REQUESTED row awaiting the creator/owner-admin.
      const resolvedStatus: ParticipantStatus =
        existingRow?.status === 'INVITED' || existing.autoApprove ? 'JOINED' : 'REQUESTED';
      if (existingRow) {
        existingRow.status = resolvedStatus;
      } else {
        participants.push({
          id: session.nextParticipantId++,
          sessionId,
          userId: mockUser.id,
          userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
          userAvatarUrl: null,
          status: resolvedStatus,
          rejectReason: null,
          createdAt: new Date().toISOString(),
        });
      }
      session.participantsState[sessionId] = participants;
      session.sessionsState = session.sessionsState.map((candidate) =>
        candidate.id === sessionId
          ? {
              ...candidate,
              participantCount:
                participants.filter((p) => p.status === 'JOINED').length + candidate.initialSlot,
            }
          : candidate,
      );
    }
    return HttpResponse.json(apiResponse(null, 'Joined session successfully'));
  }),

  http.delete('/api/sessions/:sessionId/leave', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const participants = session.participantsState[sessionId] ?? [];
    const row = participants.find((p) => p.userId === mockUser.id && p.status === 'JOINED');
    if (!row) {
      return HttpResponse.json(apiError('Not currently joined'), { status: 400 });
    }
    row.status = 'LEFT';
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            participantCount:
              participants.filter((p) => p.status === 'JOINED').length + candidate.initialSlot,
          }
        : candidate,
    );
    return HttpResponse.json(apiResponse(null, 'Left session successfully'));
  }),

  http.get('/api/sessions/:sessionId/participants', ({ request, params }) => {
    const sessionId = Number(params.sessionId);
    // SESSION-6: status omitted defaults to JOINED (the public default); any other status (in
    // practice REQUESTED, the approval queue) is real-backend-gated to canManage, but this mock
    // — same as every other handler here — doesn't simulate that 400, only the filter behavior.
    const status = (new URL(request.url).searchParams.get('status') as ParticipantStatus | null) ?? 'JOINED';
    const participants = (
      sessionsSessions.get(sessionIdFromRequest(request)).participantsState[sessionId] ?? []
    ).filter((p) => p.status === status);
    return HttpResponse.json(apiResponse(mockPageResponse(participants), 'Participants retrieved successfully'));
  }),

  http.post('/api/sessions/:sessionId/participants/:userId/approve', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const participants = session.participantsState[sessionId] ?? [];
    const row = participants.find((p) => p.userId === params.userId && p.status === 'REQUESTED');
    if (!row) {
      return HttpResponse.json(apiError('No pending join request for this user'), { status: 400 });
    }
    row.status = 'JOINED';
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            participantCount:
              participants.filter((p) => p.status === 'JOINED').length + candidate.initialSlot,
          }
        : candidate,
    );
    return HttpResponse.json(apiResponse(null, 'Participant approved successfully'));
  }),

  http.post('/api/sessions/:sessionId/participants/:userId/reject', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const participants = session.participantsState[sessionId] ?? [];
    const row = participants.find((p) => p.userId === params.userId && p.status === 'REQUESTED');
    if (!row) {
      return HttpResponse.json(apiError('No pending join request for this user'), { status: 400 });
    }
    const body = (request.headers.get('content-length') === '0' ? {} : await request.json().catch(() => ({}))) as {
      reason?: string;
    };
    row.status = 'LEFT';
    row.rejectReason = body.reason ?? null;
    return HttpResponse.json(apiResponse(null, 'Participant rejected successfully'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetSessionHandlersState(sessionId: string): void {
  sessionsSessions.reset(sessionId);
}

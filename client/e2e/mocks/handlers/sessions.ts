import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { Comment, CreateCommentPayload } from '../../../src/features/feed/types.ts';
import type { ParticipantStatus, Session, SessionParticipant } from '../../../src/shared/types/session.ts';
import {
  mockDiscoverableSession,
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

/**
 * SESSION-9: the real backend now attaches the caller's own `SessionParticipant` row (or null)
 * to every session-returning response as `callerParticipation`. This mock backend mirrors that
 * here rather than baking a static value into each fixture, so a card's Join/Accept/Cancel/Leave
 * action actually differs per session as the journey joins/leaves/accepts through it.
 */
function resolveCallerParticipation(session: SessionsSession, sessionId: number): SessionParticipant | null {
  const participants = session.participantsState[sessionId] ?? [];
  return participants.find((p) => p.userId === mockUser.id) ?? null;
}

function withCallerParticipation(session: SessionsSession, target: Session): Session {
  return { ...target, callerParticipation: resolveCallerParticipation(session, target.id) };
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
  // CLIENT-SESSION-8: session comment threads, keyed by the domain sessionId (unlike
  // feed.ts's commentsState, which is keyed by postId — session comments are reached only
  // through /sessions/{sessionId}/comments, never a postId in the URL). Same "small stateful
  // fake backend, not a fixed responder" reasoning as feed.ts's own commentsState.
  commentsState: Record<number, Comment[]>;
  nextCommentId: number;
}

// CLIENT-SESSION-1's own stateful fake backend, same "not a fixed responder"
// reasoning as groups.ts/sport.ts — a created session must actually appear
// in a later GET /sessions/mine, and join/leave/cancel must actually mutate
// state a later GET re-reads (useCreateSession/useJoinSession/etc.'s own
// invalidateQueries would otherwise clobber a static fixture on refetch).
function defaultSessionsSession(): SessionsSession {
  return {
    sessionsState: [
      { ...mockSession },
      { ...mockGroupSession },
      { ...mockOwnedGroupSession },
      { ...mockDiscoverableSession },
    ],
    // CLIENT-SESSION-4: mockOwnedGroupSession (mockUser is group_owner) starts with one
    // pre-seeded REQUESTED row, so the approval queue has something to show without needing a
    // second live authenticated session.
    participantsState: {
      [mockOwnedGroupSession.id]: [{ ...mockSessionJoinRequest }, { ...mockSecondSessionJoinRequest }],
    },
    nextSessionId: 100,
    nextParticipantId: 100,
    // CLIENT-SESSION-8: mockSession (the creator/caller's own standalone session, so the
    // Discussion section's visibility gate always passes for it) starts with one pre-seeded
    // comment, so matches-journey.spec.ts has something to read before it posts a new one.
    commentsState: {
      [mockSession.id]: [
        {
          id: 1,
          postId: mockSession.id,
          userId: mockFriend.id,
          userFullName: mockFriend.fullName,
          userAvatarUrl: null,
          content: 'What time are we meeting at the courts?',
          parentCommentId: null,
          likeCount: 0,
          replyCount: 0,
          isLikedByCurrentUser: false,
          replies: [],
          createdAt: '2026-08-01T09:00:00',
          updatedAt: '2026-08-01T09:00:00',
        },
      ],
    },
    nextCommentId: 100,
  };
}

const sessionsSessions = createSessionStore(defaultSessionsSession);

/** Locates a session comment (root or one-level reply) across every session's thread — same
 * shape as feed.ts's own `locateComment`, keyed by domain sessionId instead of postId. */
function locateSessionComment(
  session: SessionsSession,
  commentId: number,
): { sessionId: number; parentCommentId: number | null } | null {
  for (const [sessionIdKey, comments] of Object.entries(session.commentsState)) {
    for (const comment of comments) {
      if (comment.id === commentId) return { sessionId: Number(sessionIdKey), parentCommentId: null };
      if (comment.replies.some((reply) => reply.id === commentId)) {
        return { sessionId: Number(sessionIdKey), parentCommentId: comment.id };
      }
    }
  }
  return null;
}

function transformSessionComment(
  session: SessionsSession,
  sessionId: number,
  commentId: number,
  transform: (comment: Comment) => Comment,
): void {
  session.commentsState = {
    ...session.commentsState,
    [sessionId]: (session.commentsState[sessionId] ?? []).map((comment) => {
      if (comment.id === commentId) return transform(comment);
      if (comment.replies.some((reply) => reply.id === commentId)) {
        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === commentId ? transform(reply) : reply,
          ),
        };
      }
      return comment;
    }),
  };
}

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
      likeCount: 0,
      isLikedByCurrentUser: false,
      // Creator auto-join isn't simulated (see the comment above) — no row exists yet either way.
      callerParticipation: null,
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
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = session.sessionsState
      .filter((candidate) => candidate.groupId === groupId)
      .map((candidate) => withCallerParticipation(session, candidate));
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Sessions retrieved successfully'));
  }),

  http.get('/api/sessions/mine', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = session.sessionsState
      .filter((candidate) => candidate.groupId === null && candidate.createdBy === mockUser.id)
      .map((candidate) => withCallerParticipation(session, candidate));
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Sessions retrieved successfully'));
  }),

  // CLIENT-SESSION-6: registered before the `:sessionId` catch-all below, same route-ordering
  // lesson CLIENT-SESSION-5 found for /locations/favorites — MSW matches in array order, and
  // `:sessionId` would otherwise swallow the literal strings "discover"/"joined" as a bogus id
  // (Number("discover") is NaN, so it'd fall through to a false "Session not found").
  http.get('/api/sessions/discover', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sportIdParam = new URL(request.url).searchParams.get('sportId');
    const sportId = sportIdParam !== null ? Number(sportIdParam) : null;
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = session.sessionsState.filter((candidate) => {
      if (candidate.groupId !== null || candidate.status !== 'SCHEDULED') return false;
      if (candidate.createdBy === mockUser.id) return false;
      if (sportId !== null && candidate.sportId !== sportId) return false;
      const alreadyJoined = (session.participantsState[candidate.id] ?? []).some(
        (p) => p.userId === mockUser.id && p.status === 'JOINED',
      );
      return !alreadyJoined;
    });
    return HttpResponse.json(
      apiResponse(
        mockPageResponse(results.map((candidate) => withCallerParticipation(session, candidate))),
        'Sessions retrieved successfully',
      ),
    );
  }),

  http.get('/api/sessions/joined', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const statusParam = new URL(request.url).searchParams.get('status');
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = session.sessionsState.filter((candidate) => {
      if (statusParam !== null && candidate.status !== statusParam) return false;
      return (session.participantsState[candidate.id] ?? []).some(
        (p) => p.userId === mockUser.id && p.status === 'JOINED',
      );
    });
    return HttpResponse.json(
      apiResponse(
        mockPageResponse(results.map((candidate) => withCallerParticipation(session, candidate))),
        'Sessions retrieved successfully',
      ),
    );
  }),

  http.get('/api/sessions/:sessionId', ({ request, params }) => {
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const found = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!found) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    return HttpResponse.json(apiResponse(withCallerParticipation(session, found), 'Session retrieved successfully'));
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
    return HttpResponse.json(apiResponse(withCallerParticipation(session, updated), 'Session updated successfully'));
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
    return HttpResponse.json(apiResponse(withCallerParticipation(session, updated), 'Session cancelled successfully'));
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

  // CLIENT-SESSION-8: this mock doesn't simulate the real backend's 403 for a non-participant
  // (SessionGate) — every seeded/created session here is reachable only by its creator/owner in
  // practice, so the happy path is what's worth faking. Real access-gating is IT-tested
  // server-side (SessionPostAccessGateIntegrationTest), same "mock doesn't simulate every 4xx"
  // precedent participants/approve/reject above already follow.
  http.get('/api/sessions/:sessionId/comments', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    return HttpResponse.json(
      apiResponse(mockPageResponse(session.commentsState[sessionId] ?? []), 'Comments retrieved successfully'),
    );
  }),

  http.post('/api/sessions/:sessionId/comments', async ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const body = (await request.json()) as CreateCommentPayload;
    if (!body.content) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const created: Comment = {
      id: session.nextCommentId++,
      postId: sessionId,
      userId: mockUser.id,
      userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      userAvatarUrl: mockUser.avatarUrl,
      content: body.content,
      parentCommentId: body.parentCommentId ?? null,
      likeCount: 0,
      replyCount: 0,
      isLikedByCurrentUser: false,
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (body.parentCommentId === undefined) {
      session.commentsState = {
        ...session.commentsState,
        [sessionId]: [created, ...(session.commentsState[sessionId] ?? [])],
      };
    } else {
      session.commentsState = {
        ...session.commentsState,
        [sessionId]: (session.commentsState[sessionId] ?? []).map((comment) =>
          comment.id === body.parentCommentId
            ? { ...comment, replyCount: comment.replyCount + 1, replies: [...comment.replies, created] }
            : comment,
        ),
      };
    }
    return HttpResponse.json(apiResponse(created, 'Comment created successfully'), { status: 201 });
  }),

  http.post('/api/sessions/:sessionId/comments/:commentId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const commentId = Number(params.commentId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const located = locateSessionComment(session, commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformSessionComment(session, located.sessionId, commentId, (comment) => ({
      ...comment,
      isLikedByCurrentUser: true,
      likeCount: comment.likeCount + 1,
    }));
    return HttpResponse.json(apiResponse(null, 'Comment liked successfully'));
  }),

  http.delete('/api/sessions/:sessionId/comments/:commentId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const commentId = Number(params.commentId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const located = locateSessionComment(session, commentId);
    if (!located) return HttpResponse.json(apiError('Comment not found'), { status: 404 });
    transformSessionComment(session, located.sessionId, commentId, (comment) => ({
      ...comment,
      isLikedByCurrentUser: false,
      likeCount: Math.max(0, comment.likeCount - 1),
    }));
    return HttpResponse.json(apiResponse(null, 'Comment unliked successfully'));
  }),

  // CLIENT-SESSION-8: likes/unlikes the session's own SESSION_POST anchor (SESSION-10 "post-ship
  // addition"). Same "mock doesn't simulate every 4xx" precedent as the comment handlers above.
  http.post('/api/sessions/:sessionId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const existing = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!existing) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    if (existing.isLikedByCurrentUser) {
      return HttpResponse.json(apiError('Already liked'), { status: 400 });
    }
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId
        ? { ...candidate, isLikedByCurrentUser: true, likeCount: candidate.likeCount + 1 }
        : candidate,
    );
    return HttpResponse.json(apiResponse(null, 'Session liked successfully'));
  }),

  http.delete('/api/sessions/:sessionId/like', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = Number(params.sessionId);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const existing = session.sessionsState.find((candidate) => candidate.id === sessionId);
    if (!existing) {
      return HttpResponse.json(apiError('Session not found'), { status: 404 });
    }
    if (!existing.isLikedByCurrentUser) {
      return HttpResponse.json(apiError('Not currently liked'), { status: 400 });
    }
    session.sessionsState = session.sessionsState.map((candidate) =>
      candidate.id === sessionId
        ? { ...candidate, isLikedByCurrentUser: false, likeCount: Math.max(0, candidate.likeCount - 1) }
        : candidate,
    );
    return HttpResponse.json(apiResponse(null, 'Session unliked successfully'));
  }),
];

/** Test-only reset — used by the mock server's `/__mock/sessions/:id/reset`. */
export function resetSessionHandlersState(sessionId: string): void {
  sessionsSessions.reset(sessionId);
}

/**
 * CLIENT-SESSION-8: cross-store fallback for feed.ts's `DELETE /api/posts/comments/:commentId`
 * handler — the real backend's `Comment` table (and this one endpoint) is genuinely shared
 * between feed comments and session comments (SESSION-10's `SESSION_POST` reuse), so a comment
 * id feed.ts's own store doesn't recognize might belong to a session's thread instead. Returns
 * `true` if it was found (and deleted) here, so the caller knows not to 404.
 */
export function deleteSessionCommentIfPresent(mockServerSessionId: string, commentId: number): boolean {
  const session = sessionsSessions.get(mockServerSessionId);
  const located = locateSessionComment(session, commentId);
  if (!located) return false;
  if (located.parentCommentId === null) {
    session.commentsState = {
      ...session.commentsState,
      [located.sessionId]: (session.commentsState[located.sessionId] ?? []).filter(
        (comment) => comment.id !== commentId,
      ),
    };
  } else {
    session.commentsState = {
      ...session.commentsState,
      [located.sessionId]: (session.commentsState[located.sessionId] ?? []).map((comment) =>
        comment.id === located.parentCommentId
          ? {
              ...comment,
              replyCount: Math.max(0, comment.replyCount - 1),
              replies: comment.replies.filter((reply) => reply.id !== commentId),
            }
          : comment,
      ),
    };
  }
  return true;
}

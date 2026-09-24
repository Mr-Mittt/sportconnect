import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ApiResponse } from '../../../src/shared/types/api.ts';
import type { Comment, CreateCommentPayload } from '../../../src/features/feed/types.ts';
import type { ParticipantStatus, Session, SessionParticipant } from '../../../src/shared/types/session.ts';
import {
  mockCancelledSession,
  mockDiscoverableSession,
  mockFriend,
  mockGroupSession,
  mockInvitedSession,
  mockLocation,
  mockOwnedGroupSession,
  mockPreparingSession,
  mockRequestedSession,
  mockSecondSessionJoinRequest,
  mockSession,
  mockSessionJoinRequest,
  mockUser,
  mockUserInvitedRow,
  mockUserRequestedRow,
} from '../fixtures.ts';
import { getOverrides } from '../overrides.ts';
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

/**
 * CLIENT-SESSION-24: mirrors backend SESSION-33 — `scheduledStart` is a `java.time.Instant`, so
 * Jackson rejects an offset-less string (`2026-09-24T11:00:00`) with a 400 and only accepts `Z`
 * or a `±HH:MM` offset. This mock used to accept any string, which is why e2e never caught the
 * client still sending the old bare local datetime.
 */
const OFFSET_AWARE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function isOffsetAware(value: string): boolean {
  return OFFSET_AWARE_ISO.test(value);
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

/**
 * CLIENT-SESSION-23 — a real Spring `Page` slice of `all` for the request's `page`/`size` (default
 * 0/20), unlike `mockPageResponse` above (always one page). `/upcoming` and `/history` need real
 * paging: the client's "Load more" reads `last`/`number` off the page it just got.
 */
function slicePage<T>(all: T[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? 0);
  const size = Number(url.searchParams.get('size') ?? 20);
  const content = all.slice(page * size, (page + 1) * size);
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  return {
    content,
    totalPages,
    totalElements: all.length,
    number: page,
    size,
    first: page === 0,
    last: page >= totalPages - 1,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

/** `yyyy-MM-dd` of `scheduledStart` in `zone` — what the real backend's `viewerZoneId` bucketing
 * (SESSION-34/35) does with a session's true instant. The fixtures' offset-less `scheduledStart`
 * strings parse in this Node process's own zone, the same zone a default Playwright browser
 * context reports, so a fixture's wall-clock day survives the round trip unchanged. */
function dateInZone(scheduledStart: string, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(scheduledStart));
}

/** The caller's own participant row on a session, or undefined — every "mine" list below is
 * scoped by this, exactly like the real `/upcoming`/`/history` (backend SESSION-27). */
function callerRow(session: SessionsSession, sessionId: number): SessionParticipant | undefined {
  return (session.participantsState[sessionId] ?? []).find((p) => p.userId === mockUser.id);
}

const UPCOMING_STATUSES: ReadonlyArray<Session['status']> = ['PREPARING', 'SCHEDULED', 'ONGOING'];
const HISTORY_STATUSES: ReadonlyArray<Session['status']> = ['CANCELLED', 'COMPLETED'];
/** `/upcoming`'s tiebreak for sessions sharing an exact `scheduledStart`. */
const UPCOMING_STATUS_RANK: Record<string, number> = { PREPARING: 0, SCHEDULED: 1, ONGOING: 2 };

/**
 * `overrides.historyVolume` (CLIENT-SESSION-23): synthesizes enough history for the client's two
 * "Load more" levels without hand-writing 40+ fixtures — 22 distinct dates (one more page than
 * `dateCount=20`) for the requested sport, one of which (the newest) holds 23 sessions (one more
 * than a date's own page size of 20). Generated per request from `sportId`, so either sport pill
 * sees it; not part of `sessionsState`, so they have no detail route (nothing needs one).
 */
function syntheticHistory(sportId: number): Session[] {
  const template = mockCancelledSession;
  const make = (id: number, day: number, minute: number): Session => ({
    ...template,
    id,
    sportId,
    title: `History session ${id}`,
    status: 'COMPLETED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    // Mid-day + minute steps: a wall-clock 10:xx never crosses a date line under any zone offset
    // the mock server and the browser context could plausibly differ by.
    scheduledStart: `2026-07-${String(day).padStart(2, '0')}T10:${String(minute).padStart(2, '0')}:00`,
    callerParticipation: {
      id: id,
      sessionId: id,
      userId: mockUser.id,
      userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
      userAvatarUrl: mockUser.avatarUrl,
      status: 'JOINED',
      rejectReason: null,
      createdAt: '2026-07-01T00:00:00',
    },
  });
  const sessions: Session[] = [];
  // Newest date (Jul 22): 23 sessions, 10:00-10:22 — more than one 20-row page.
  for (let i = 0; i < 23; i++) sessions.push(make(1000 + i, 22, i));
  // 21 older dates (Jul 1-21), one session each -> 22 distinct dates in total.
  for (let day = 1; day <= 21; day++) sessions.push(make(2000 + day, day, 12));
  return sessions;
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
// in a later GET /sessions/upcoming, and join/leave/cancel must actually mutate
// state a later GET re-reads (useCreateSession/useJoinSession/etc.'s own
// invalidateQueries would otherwise clobber a static fixture on refetch).
function seededJoinedRow(sessionId: number, id: number): SessionParticipant {
  return {
    id,
    sessionId,
    userId: mockUser.id,
    userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
    userAvatarUrl: mockUser.avatarUrl,
    status: 'JOINED',
    rejectReason: null,
    createdAt: '2026-07-01T00:00:00',
  };
}

// The seeded JOINED rows above must be reflected in each session's own `participantCount` (real
// backend: JOINED rows + initialSlot), or a card would say "0/10" over a one-person Players list.
function withJoinedCount(target: Session): Session {
  return { ...target, participantCount: target.participantCount + 1 };
}

function defaultSessionsSession(): SessionsSession {
  return {
    sessionsState: [
      withJoinedCount(mockSession),
      withJoinedCount(mockGroupSession),
      withJoinedCount(mockOwnedGroupSession),
      { ...mockDiscoverableSession },
      { ...mockInvitedSession },
      { ...mockRequestedSession },
      withJoinedCount(mockCancelledSession),
      // CLIENT-SESSION-23: see the fixture's own note — soonest-first rail cap never shows it.
      withJoinedCount(mockPreparingSession),
    ],
    // CLIENT-SESSION-4: mockOwnedGroupSession (mockUser is group_owner) starts with one
    // pre-seeded REQUESTED row, so the approval queue has something to show without needing a
    // second live authenticated session. CLIENT-SESSION-12: mockInvitedSession/
    // mockRequestedSession pre-seed mockUser's own INVITED/REQUESTED row for the same reason,
    // one level down — the caller's own pending-invite/pending-approval view, not the owner's
    // queue.
    participantsState: {
      // CLIENT-SESSION-23: /upcoming and /history are participant-scoped (backend SESSION-27), so a
      // session only shows up in the fixture user's "My sessions"/rail once they hold a row on it.
      // Seeded JOINED for the four sessions the pre-23 mock surfaced via the mine/group fan-out:
      // mockSession (creator of a standalone session — the real backend auto-JOINs them),
      // mockGroupSession (a group session they joined), mockOwnedGroupSession (their own group
      // session, joined), and mockCancelledSession (creator, then cancelled — the History seed).
      // mockDiscoverableSession is deliberately left un-joined: it is the Discover/join fixture.
      [mockSession.id]: [seededJoinedRow(mockSession.id, 10)],
      [mockGroupSession.id]: [seededJoinedRow(mockGroupSession.id, 11)],
      [mockCancelledSession.id]: [seededJoinedRow(mockCancelledSession.id, 13)],
      [mockPreparingSession.id]: [seededJoinedRow(mockPreparingSession.id, 14)],
      [mockOwnedGroupSession.id]: [
        seededJoinedRow(mockOwnedGroupSession.id, 12),
        { ...mockSessionJoinRequest },
        { ...mockSecondSessionJoinRequest },
      ],
      [mockInvitedSession.id]: [{ ...mockUserInvitedRow }],
      [mockRequestedSession.id]: [{ ...mockUserRequestedRow }],
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
          commentType: 'USER',
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
        // CLIENT-SESSION-13: a SESSION_SYSTEM entry alongside the user comment, so the
        // thread fixture covers both kinds the backend actually writes. Mirrors SESSION-21's
        // real shape exactly — server-templated content, no likes/replies, and authored by
        // the session creator (mockUser owns mockSession), which is precisely why it must
        // not render as that person speaking.
        {
          id: 2,
          postId: mockSession.id,
          commentType: 'SESSION_SYSTEM',
          userId: mockUser.id,
          userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
          userAvatarUrl: null,
          content: `${mockFriend.fullName} joined the session`,
          parentCommentId: null,
          likeCount: 0,
          replyCount: 0,
          isLikedByCurrentUser: false,
          replies: [],
          createdAt: '2026-08-01T09:30:00',
          updatedAt: '2026-08-01T09:30:00',
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

// CLIENT-SESSION-22 — shared by /discover and /discover/counts below, mirroring SESSION-25's
// filter set. `date` itself is deliberately NOT filtered here (never was, pre-22 either) — every
// fixture session carries a fixed `scheduledStart` unrelated to "today", and this mock has always
// returned its date-agnostic match set regardless of the caller's requested date; the client only
// ever requests one date/window at a time, so this doesn't create any inconsistency a journey
// would notice.
function discoverableSessions(session: SessionsSession, url: URL) {
  const sportIdParam = url.searchParams.get('sportId');
  const sportId = sportIdParam !== null ? Number(sportIdParam) : null;
  const title = url.searchParams.get('title');
  const locationIds = url.searchParams.getAll('locationId').map(Number);
  // CLIENT-SESSION-29: statuses (repeated `status` param), minOpenSlots, feeType, maxFeeAmountVnd
  // — the three new Discover filters, same AND-combined semantics the real /discover endpoint uses.
  const statuses = url.searchParams.getAll('status');
  const minOpenSlotsParam = url.searchParams.get('minOpenSlots');
  const minOpenSlots = minOpenSlotsParam !== null ? Number(minOpenSlotsParam) : null;
  const feeType = url.searchParams.get('feeType');
  const maxFeeAmountVndParam = url.searchParams.get('maxFeeAmountVnd');
  const maxFeeAmountVnd = maxFeeAmountVndParam !== null ? Number(maxFeeAmountVndParam) : null;
  return session.sessionsState.filter((candidate) => {
    if (candidate.groupId !== null || candidate.status !== 'SCHEDULED') return false;
    if (candidate.createdBy === mockUser.id) return false;
    if (sportId !== null && candidate.sportId !== sportId) return false;
    if (title !== null && !(candidate.title ?? '').toLowerCase().includes(title.toLowerCase())) return false;
    if (locationIds.length > 0 && !locationIds.includes(candidate.location?.id ?? -1)) return false;
    if (statuses.length > 0 && !statuses.includes(candidate.status)) return false;
    if (minOpenSlots !== null && candidate.capacity - candidate.participantCount < minOpenSlots) return false;
    if (feeType !== null && candidate.feeType !== feeType) return false;
    if (
      maxFeeAmountVnd !== null &&
      (candidate.feeType !== 'FIXED' || (candidate.feeAmountVnd ?? 0) > maxFeeAmountVnd)
    )
      return false;
    // SESSION-42: mirrors the real backend's widened exclusion — a session the caller already
    // requested to join or was invited to shouldn't still surface as newly discoverable, same
    // as one they're already JOINED to (previously JOINED-only here).
    const alreadyParticipating = (session.participantsState[candidate.id] ?? []).some(
      (p) =>
        p.userId === mockUser.id &&
        (p.status === 'JOINED' || p.status === 'REQUESTED' || p.status === 'INVITED'),
    );
    return !alreadyParticipating;
  });
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
      // SESSION-24 / CLIENT-SESSION-21: both optional now — omitted -> PREPARING.
      locationId?: number;
      locationNote?: string;
      scheduledStart: string;
      durationMinutes?: number;
      capacity: number;
      feeType?: Session['feeType'];
      feeAmountVnd?: number;
      initialSlot?: number;
      autoApprove?: boolean;
      inviteeIds?: string[];
      // CLIENT-SESSION-15 / SESSION-23: path-keyed session attributes. The real backend filters
      // these against the sport's session schema; this mock stores what it's sent.
      attributes?: Record<string, unknown>;
    };
    if (!body.scheduledStart || body.capacity === undefined) {
      return HttpResponse.json(apiError('Validation failed'), { status: 400 });
    }
    if (!isOffsetAware(body.scheduledStart)) {
      return HttpResponse.json(apiError('scheduledStart must include a UTC offset'), { status: 400 });
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
      location: body.locationId !== undefined ? mockLocation : null,
      locationNote: body.locationNote ?? null,
      scheduledStart: body.scheduledStart,
      scheduledEndAt: null,
      // SESSION-24: missing either -> PREPARING instead of SCHEDULED.
      status: body.locationId !== undefined && body.feeType !== undefined ? 'SCHEDULED' : 'PREPARING',
      cancelReason: null,
      cancelledBy: null,
      cancelledByFullName: null,
      cancelledAt: null,
      // Real backend: participantCount = real JOINED rows + initialSlot, and a standalone
      // session's creator is auto-JOINED (SESSION-14 rule 8). CLIENT-SESSION-23 now simulates that
      // (it has to: /upcoming is participant-scoped, so a freshly created session would otherwise
      // never appear in the creator's own list) — a group-linked session's creator is not
      // auto-joined, matching the real backend.
      participantCount: initialSlot + (body.groupId === undefined ? 1 : 0),
      capacity: body.capacity,
      feeType: body.feeType ?? null,
      feeAmountVnd: body.feeType === 'FIXED' ? (body.feeAmountVnd ?? null) : null,
      initialSlot,
      autoApprove: body.autoApprove ?? false,
      attributes: body.attributes ?? null,
      likeCount: 0,
      isLikedByCurrentUser: false,
      // The POST response itself is never read for this field — every list/detail GET resolves
      // `callerParticipation` per response from `participantsState` (withCallerParticipation).
      callerParticipation: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    session.sessionsState = [created, ...session.sessionsState];
    if (body.groupId === undefined) {
      session.participantsState[created.id] = [
        {
          id: session.nextParticipantId++,
          sessionId: created.id,
          userId: mockUser.id,
          userFullName: `${mockUser.firstName} ${mockUser.lastName}`,
          userAvatarUrl: mockUser.avatarUrl,
          status: 'JOINED',
          rejectReason: null,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    // SESSION-6: pre-create an INVITED row per deduped invitee id (excluding the creator's own),
    // resolved only by that user's own later joinSession call, which bypasses autoApprove entirely.
    const dedupedInviteeIds = [...new Set(body.inviteeIds ?? [])].filter((id) => id !== mockUser.id);
    if (dedupedInviteeIds.length > 0) {
      session.participantsState[created.id] = [
        ...(session.participantsState[created.id] ?? []),
        ...dedupedInviteeIds.map(
          (inviteeId): SessionParticipant => ({
            id: session.nextParticipantId++,
            sessionId: created.id,
            userId: inviteeId,
            userFullName: KNOWN_USER_NAMES[inviteeId] ?? 'Invited user',
            userAvatarUrl: null,
            status: 'INVITED',
            rejectReason: null,
            createdAt: new Date().toISOString(),
          }),
        ),
      ];
    }
    return HttpResponse.json(apiResponse(created, 'Session created successfully'), { status: 201 });
  }),

  http.get('/api/sessions/group/:groupId', ({ request, params }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const sessionId = sessionIdFromRequest(request);
    if (getOverrides(sessionId).sessionsEmpty) {
      return HttpResponse.json(apiResponse(mockPageResponse([]), 'Sessions retrieved successfully'));
    }
    const groupId = Number(params.groupId);
    const session = sessionsSessions.get(sessionId);
    const results = session.sessionsState
      .filter((candidate) => candidate.groupId === groupId)
      .map((candidate) => withCallerParticipation(session, candidate));
    return HttpResponse.json(apiResponse(mockPageResponse(results), 'Sessions retrieved successfully'));
  }),

  // CLIENT-SESSION-23 — `GET /sessions/upcoming` (backend SESSION-27/43), replacing the removed
  // `/mine`: sessions where the caller holds a JOINED or INVITED row, status
  // PREPARING/SCHEDULED/ONGOING, standalone or group-linked; optional `sportId` (absent = all sports)
  // and `date` (+ `viewerZoneId`, 400 without `date`); `scheduledStart` ASC with a
  // PREPARING→SCHEDULED→ONGOING tiebreak; real page/size paging. Registered before the
  // `:sessionId` catch-all, same route-ordering reasoning as /discover below.
  http.get('/api/sessions/upcoming', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const viewerZoneId = url.searchParams.get('viewerZoneId');
    if (date === null && viewerZoneId !== null) {
      return HttpResponse.json(apiError('viewerZoneId is only valid alongside date'), { status: 400 });
    }
    const sessionId = sessionIdFromRequest(request);
    if (getOverrides(sessionId).sessionsEmpty) {
      return HttpResponse.json(apiResponse(slicePage([], url), 'Sessions retrieved successfully'));
    }
    const sportIdParam = url.searchParams.get('sportId');
    const session = sessionsSessions.get(sessionId);
    const results = session.sessionsState
      .filter((candidate) => {
        if (!UPCOMING_STATUSES.includes(candidate.status)) return false;
        const row = callerRow(session, candidate.id);
        if (row?.status !== 'JOINED' && row?.status !== 'INVITED') return false;
        if (sportIdParam !== null && candidate.sportId !== Number(sportIdParam)) return false;
        if (date !== null && dateInZone(candidate.scheduledStart, viewerZoneId ?? 'UTC') !== date) return false;
        return true;
      })
      .sort(
        (a, b) =>
          Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart) ||
          UPCOMING_STATUS_RANK[a.status] - UPCOMING_STATUS_RANK[b.status],
      )
      .map((candidate) => withCallerParticipation(session, candidate));
    return HttpResponse.json(apiResponse(slicePage(results, url), 'Sessions retrieved successfully'));
  }),

  // CLIENT-SESSION-23 — `GET /sessions/history` (backend SESSION-27/34/35/43), replacing the
  // removed `/joined`. `sportId` REQUIRED; exactly one of `date` (that day's CANCELLED/COMPLETED
  // sessions the caller was JOINED to, `scheduledStart` DESC, paged) or `dateCount` (the last N
  // distinct dates, most-recent-first, with per-date counts, `before` = exclusive cursor,
  // `hasMore` from fetching one extra). Both bucket by `viewerZoneId` (UTC when omitted).
  http.get('/api/sessions/history', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const sportIdParam = url.searchParams.get('sportId');
    const date = url.searchParams.get('date');
    const dateCountParam = url.searchParams.get('dateCount');
    const before = url.searchParams.get('before');
    if (sportIdParam === null) {
      return HttpResponse.json(apiError('sportId is required'), { status: 400 });
    }
    if ((date === null) === (dateCountParam === null)) {
      return HttpResponse.json(apiError('Exactly one of date or dateCount is required'), { status: 400 });
    }
    if (dateCountParam === null && before !== null) {
      return HttpResponse.json(apiError('before is only valid alongside dateCount'), { status: 400 });
    }
    const dateCount = dateCountParam !== null ? Number(dateCountParam) : null;
    if (dateCount !== null && !(dateCount > 0)) {
      return HttpResponse.json(apiError('dateCount must be positive'), { status: 400 });
    }

    const sessionId = sessionIdFromRequest(request);
    const zone = url.searchParams.get('viewerZoneId') ?? 'UTC';
    const sportId = Number(sportIdParam);
    const session = sessionsSessions.get(sessionId);
    const fromState = session.sessionsState
      .filter(
        (candidate) =>
          HISTORY_STATUSES.includes(candidate.status) &&
          candidate.sportId === sportId &&
          callerRow(session, candidate.id)?.status === 'JOINED',
      )
      .map((candidate) => withCallerParticipation(session, candidate));
    const candidates = [
      ...fromState,
      ...(getOverrides(sessionId).historyVolume ? syntheticHistory(sportId) : []),
    ];

    if (date !== null) {
      const results = candidates
        .filter((candidate) => dateInZone(candidate.scheduledStart, zone) === date)
        .sort((a, b) => Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart));
      return HttpResponse.json(apiResponse(slicePage(results, url), 'Sessions retrieved successfully'));
    }

    const countsByDate = new Map<string, number>();
    for (const candidate of candidates) {
      const day = dateInZone(candidate.scheduledStart, zone);
      countsByDate.set(day, (countsByDate.get(day) ?? 0) + 1);
    }
    const allDates = [...countsByDate.entries()]
      .map(([day, count]) => ({ date: day, count }))
      .filter((entry) => before === null || entry.date < before)
      .sort((a, b) => b.date.localeCompare(a.date));
    const limit = dateCount ?? 0;
    return HttpResponse.json(
      apiResponse(
        { dates: allDates.slice(0, limit), hasMore: allDates.length > limit },
        'History dates retrieved successfully',
      ),
    );
  }),

  // CLIENT-SESSION-6: registered before the `:sessionId` catch-all below, same route-ordering
  // lesson CLIENT-SESSION-5 found for /locations/favorites — MSW matches in array order, and
  // `:sessionId` would otherwise swallow the literal strings "discover"/"upcoming" as a bogus id
  // (Number("discover") is NaN, so it'd fall through to a false "Session not found").
  http.get('/api/sessions/discover', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = discoverableSessions(session, new URL(request.url));
    return HttpResponse.json(
      apiResponse(
        mockPageResponse(results.map((candidate) => withCallerParticipation(session, candidate))),
        'Sessions retrieved successfully',
      ),
    );
  }),

  // SESSION-39 — shares /discover's filter set except date/pagination. `date` (repeated) picks the
  // explicit dates to report on; omitted -> today + next 7 days, same default window as the real
  // backend. Every matching session's full count is attributed to every date in the effective
  // window/list (see discoverableSessions' own doc comment on why date isn't really filtered here).
  http.get('/api/sessions/discover/counts', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const count = discoverableSessions(session, url).length;
    const explicitDates = url.searchParams.getAll('date');
    const dates =
      explicitDates.length > 0
        ? explicitDates
        : Array.from({ length: 8 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() + i);
            return date.toISOString().slice(0, 10);
          });
    return HttpResponse.json(
      apiResponse({ counts: dates.map((date) => ({ date, count })) }, 'Discover date counts retrieved successfully'),
    );
  }),

  // CLIENT-SESSION-29 — `GET /sessions/requested` (backend SESSION-42): the caller's own pending
  // REQUESTED rows, any status PREPARING/SCHEDULED/ONGOING, standalone or group-linked. No filter
  // params at all (unlike /discover, /upcoming) — registered before the `:sessionId` catch-all,
  // same route-ordering reasoning as /discover above.
  http.get('/api/sessions/requested', ({ request }) => {
    const unauthorized = requireAuth(request);
    if (unauthorized) return unauthorized;
    const session = sessionsSessions.get(sessionIdFromRequest(request));
    const results = session.sessionsState.filter((candidate) => {
      if (!['PREPARING', 'SCHEDULED', 'ONGOING'].includes(candidate.status)) return false;
      return (session.participantsState[candidate.id] ?? []).some(
        (p) => p.userId === mockUser.id && p.status === 'REQUESTED',
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
    // The real request body is `UpdateSessionPayload` (a `locationId` number, not the resolved
    // `Location` object `Session.location` carries) — never `Partial<Session>`.
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      locationId?: number;
      locationNote?: string;
      scheduledStart?: string;
      durationMinutes?: number;
      capacity?: number;
      feeType?: Session['feeType'];
      feeAmountVnd?: number;
      initialSlot?: number;
    };
    if (body.scheduledStart !== undefined && !isOffsetAware(body.scheduledStart)) {
      return HttpResponse.json(apiError('scheduledStart must include a UTC offset'), { status: 400 });
    }
    // SESSION-24: locationId/feeType are mutable via this endpoint only while PREPARING.
    if ((body.locationId !== undefined || body.feeType !== undefined) && existing.status !== 'PREPARING') {
      return HttpResponse.json(
        apiError('Location and fee are immutable once the session is no longer being prepared'),
        { status: 400 },
      );
    }
    const resolvedLocation = body.locationId !== undefined ? mockLocation : existing.location;
    const resolvedFeeType = body.feeType ?? existing.feeType;
    const updated: Session = {
      ...existing,
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      location: resolvedLocation,
      ...(body.locationNote !== undefined && { locationNote: body.locationNote }),
      ...(body.scheduledStart !== undefined && { scheduledStart: body.scheduledStart }),
      ...(body.capacity !== undefined && { capacity: body.capacity }),
      feeType: resolvedFeeType,
      feeAmountVnd: resolvedFeeType === 'FIXED' ? (body.feeAmountVnd ?? existing.feeAmountVnd) : null,
      ...(body.initialSlot !== undefined && { initialSlot: body.initialSlot }),
      // SESSION-24: completing both while PREPARING flips it to SCHEDULED; completing only one
      // leaves it PREPARING.
      status:
        existing.status === 'PREPARING' && resolvedLocation !== null && resolvedFeeType !== null
          ? 'SCHEDULED'
          : existing.status,
      updatedAt: new Date().toISOString(),
    };
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
      commentType: 'USER',
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

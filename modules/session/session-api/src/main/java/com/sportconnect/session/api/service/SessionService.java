package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionHistoryDatesResponse;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.StartTimeFilter;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface SessionService {

    /**
     * groupId null → standalone (open to any ROLE_USER, sportId required in the request).
     * groupId non-null → requires GroupService.canManageMembers; sportId inherited from the
     * group if omitted. When {@code locationId} is supplied, it must resolve to a Location whose
     * sportId matches the session's resolved sportId — a BadRequestException otherwise.
     *
     * <p>SESSION-24: {@code locationId} and {@code feeType} are both optional. Missing either (or
     * both) starts the session as {@code PREPARING} instead of {@code SCHEDULED} — see {@code
     * updateSession} for how it's completed, and {@code SessionStatus}'s own Javadoc for the full
     * lifecycle.
     *
     * <p>SESSION-23: when {@code request.attributes} is non-null it is filtered against the sport's
     * session attribute schema ({@code SportService.getSessionAttributeSchemaRaw}) — unknown /
     * wrong-typed / switched-off entries are dropped silently — and the surviving map is stored
     * wholesale; a filtered map over 4KB serialized fails with a BadRequestException. Omitting
     * {@code attributes} stores none and skips the schema lookup entirely.
     *
     * <p>SESSION-33: {@code request.scheduledStart} is a client-supplied offset-aware instant,
     * stored exactly as the UTC instant it implies — never reinterpreted through {@code
     * locationId}'s own timezone.
     */
    SessionResponse createSession(UUID userId, CreateSessionRequest request);

    /** callerId (SESSION-9) resolves SessionResponse.callerParticipation — the caller's own
     * SessionParticipant row for this session, or null if they have none. */
    SessionResponse getSession(Long sessionId, UUID callerId);

    /**
     * Delegates private-group visibility to GroupService.getGroup(groupId, currentUserId) before
     * querying — reuses the existing membership gate rather than reimplementing it.
     */
    Page<SessionResponse> getGroupSessions(Long groupId, UUID currentUserId, Pageable pageable);

    /**
     * SESSION-27 — every session (standalone or group-linked) where the caller currently has a
     * {@code JOINED} or {@code INVITED} participant row (never {@code REQUESTED}), restricted to
     * {@code Session.status IN (PREPARING, SCHEDULED, ONGOING)}. {@code date}, when given, narrows
     * to that calendar date's {@code scheduledStart}; {@code null} returns every matching session.
     * Replaces the removed {@code getSessionsCreatedByUser}/{@code GET /sessions/mine} — the real
     * fix for the client-side {@code mine} + {@code joined} + per-group fan-out/merge this ticket
     * was filed to close.
     *
     * <p>Sorted {@code scheduledStart ASC} (soonest first), with a second sort level — status in
     * {@code PREPARING}→{@code SCHEDULED}→{@code ONGOING} order — breaking ties when two sessions
     * share the exact same {@code scheduledStart} (also makes pagination deterministic across
     * those ties). Enforced in the DB query regardless of what {@code Sort} the caller's
     * {@code Pageable} carries — only its {@code page}/{@code size} are honoured, the sort itself
     * is not caller-configurable.
     *
     * <p>SESSION-35: when {@code date} is given, its day boundaries are computed in
     * {@code viewerZoneId} (nullable, an IANA zone id, falling back to {@code "UTC"} when omitted)
     * rather than the JVM's own zone — a caller-relative "today", not a server-relative one.
     * {@code viewerZoneId} given without {@code date} is rejected by the controller (it would have
     * no effect). Invalid (unparseable) values are rejected with a {@code BadRequestException}.
     */
    Page<SessionResponse> getUpcomingSessions(UUID userId, LocalDate date, String viewerZoneId, Pageable pageable);

    /**
     * SESSION-27 — every session (standalone or group-linked) where the caller currently has a
     * {@code JOINED} participant row (not {@code INVITED} — an invite never accepted isn't "my
     * history"), restricted to {@code Session.status IN (CANCELLED, COMPLETED)}, narrowed to
     * {@code date}'s calendar date. Sorted {@code scheduledStart DESC} — matches
     * {@code groupSessionsByDate.ts}'s existing history-zone convention (newest-within-the-day
     * first) — same "caller's Pageable sort is ignored" contract as {@link #getUpcomingSessions}.
     *
     * <p>SESSION-35: {@code date}'s day boundaries are computed in {@code viewerZoneId} (nullable,
     * an IANA zone id, falling back to {@code "UTC"} when omitted) rather than the JVM's own zone —
     * same caller-relative treatment as {@link #getUpcomingSessions}. Invalid (unparseable) values
     * are rejected with a {@code BadRequestException}.
     */
    Page<SessionResponse> getSessionHistory(UUID userId, LocalDate date, String viewerZoneId, Pageable pageable);

    /**
     * SESSION-27/34 — the last {@code dateCount} distinct calendar dates (most-recent-first) on
     * which the caller has at least one session matching {@link #getSessionHistory}'s population
     * (standalone-or-group-linked, {@code JOINED}, {@code CANCELLED}/{@code COMPLETED}), each
     * annotated with its own per-date count. {@code before} (nullable, exclusive) pages further
     * back — the next {@code dateCount} distinct history dates strictly older than {@code before}.
     *
     * <p>This is pagination over <em>distinct dates</em>, not over individual sessions — a given
     * date's own session list is fetched separately via {@link #getSessionHistory} once the caller
     * expands that date.
     *
     * <p><b>SESSION-34:</b> {@code viewerZoneId} (nullable, an IANA zone id) is the zone this
     * history is bucketed in — a personal activity log reads oddest when a session's date is pinned
     * to somewhere the viewer no longer is (it can even show a completed session as "in the future"
     * relative to the viewer's own current clock, if the viewer has since moved to a very different
     * zone), so this endpoint buckets by the viewer's own <em>current</em> zone, not the session's
     * location/origin zone. Invalid (unparseable) values are rejected with a
     * {@code BadRequestException}. Nullable only because today's client doesn't send it yet
     * (CLIENT-SESSION-24) — when omitted, this falls back to {@code "UTC"} rather than failing the
     * request outright, since every existing caller omits it until that client ticket ships.
     */
    SessionHistoryDatesResponse getSessionHistoryDates(
            UUID userId, int dateCount, LocalDate before, String viewerZoneId);

    /**
     * Standalone → creator-only. Group-linked → owner/admin via canManageMembers.
     *
     * <p>SESSION-24: {@code locationId}/{@code feeType} may only be changed while the session is
     * {@code PREPARING} — a request touching either while the session is genuinely {@code
     * SCHEDULED} (or beyond) is a BadRequestException, checked before any field is applied.
     * Completing both flips the session to {@code SCHEDULED}; completing only one leaves it
     * {@code PREPARING}. Every successful call also fans out a {@code session.details.updated}
     * notification to the session's currently-{@code JOINED} participants, regardless of which
     * field(s) changed.
     *
     * <p>SESSION-23: {@code request.attributes} has replace semantics — a non-null map is filtered
     * (as in {@link #createSession}) and stored wholesale, an explicit empty map clears the stored
     * attributes, and a null/omitted map leaves them untouched (and never fetches the schema, so a
     * non-attribute edit on a session whose sport was since deactivated still succeeds).
     */
    SessionResponse updateSession(Long sessionId, UUID userId, UpdateSessionRequest request);

    /**
     * Same gating as updateSession. A soft action — the row is kept with status=CANCELLED plus
     * cancelReason/cancelledBy/cancelledAt, never deleted. Rejected with BadRequestException if
     * the session is already COMPLETED or CANCELLED.
     */
    SessionResponse cancelSession(Long sessionId, UUID userId, CancelSessionRequest request);

    /**
     * Group-linked requires GroupService.isGroupMember; standalone is open to any caller.
     * Upserts SessionParticipant — an existing LEFT row flips back to JOINED rather than a
     * duplicate insert. A caller who is already JOINED is a no-op (SESSION-16) — no status
     * change, no save, no outbox event — rather than falling through the autoApprove ternary,
     * which would otherwise demote them back to REQUESTED on a non-autoApprove session.
     */
    void joinSession(Long sessionId, UUID userId);

    /**
     * Requires an existing JOINED, INVITED, or REQUESTED row; flips it to LEFT.
     * BadRequestException if no such row exists. Doubles as "decline" for an INVITED row and
     * "cancel my request" for a REQUESTED one (SESSION-9) — same endpoint as a plain leave, the
     * client just labels the button differently based on the caller's current status. Unlike
     * rejectParticipant, never sets rejectReason (that field is reserved for manager-initiated
     * rejection). SESSION-14: rejects with BadRequestException when the caller is the creator of
     * a standalone session (groupId null) — cancelSession is their only way out; not enforced for
     * a group-linked session's creator, who isn't auto-joined and can leave like any other member
     * if they choose to join one.
     */
    void leaveSession(Long sessionId, UUID userId);

    /**
     * status omitted → JOINED, public (unchanged contract). Any other status (in practice
     * REQUESTED, the approval queue, or INVITED) requires the caller to pass requireCanModify's
     * gate — creator for standalone, owner/admin for group-linked — same as
     * cancelSession/updateSession.
     */
    Page<SessionParticipantResponse> getSessionParticipants(
            Long sessionId, UUID callerId, ParticipantStatus status, Pageable pageable);

    /**
     * Transitions a REQUESTED row to JOINED. Same gating as cancelSession/updateSession.
     * BadRequestException if the session is CANCELLED or no REQUESTED row exists for userId
     * (an INVITED row isn't approvable here — only the invitee's own joinSession call resolves
     * it).
     */
    void approveParticipant(Long sessionId, UUID callerId, UUID userId);

    /**
     * Transitions a REQUESTED row to LEFT, persisting the optional reason. Same
     * gating/exceptions as approveParticipant.
     */
    void rejectParticipant(Long sessionId, UUID callerId, UUID userId, RejectParticipantRequest request);

    /**
     * Standalone sessions (groupId null) the caller can discover and join, restricted to sports
     * the caller holds an active UserSportProfile for, excluding sessions the caller created and
     * sessions the caller currently has a JOINED participant row for. If sportId is given but
     * isn't one of the caller's active sports, returns an empty page rather than throwing. A
     * caller with zero active sport profiles also gets an empty page.
     *
     * <p>SESSION-25 — every other parameter except {@code date} is optional and AND-combined:
     * {@code title} (case-insensitive substring match), {@code locationId} (exact match),
     * {@code minOpenSlots} (a session qualifies when its remaining open slots — capacity minus
     * participantCount minus initialSlot — minus {@code minOpenSlots} is {@code > 0}),
     * {@code feeType} (exact match) and/or {@code maxFeeAmountVnd} (upper bound on
     * feeAmountVnd, meaningful only when feeType is FIXED), and {@code startTimeFilter}/
     * {@code startTime} (compares scheduledStart's time-of-day component against the given time,
     * independent of {@code date}). {@code statuses} restricts to a subset of
     * {@code PREPARING}/{@code SCHEDULED}/{@code ONGOING}; a null/empty list defaults to
     * {@code PREPARING}/{@code SCHEDULED} (SESSION-37 dropped {@code ONGOING} from the default —
     * see below).
     *
     * <p><b>SESSION-35 (2026-09-18): {@code date} is required</b>, not optional — validated
     * non-null by the controller (missing → 400).
     *
     * <p><b>SESSION-37 final decision — supersedes SESSION-35's exact-day match and the original
     * SESSION-25 status/startTimeFilter contract:</b>
     * <ul>
     *   <li>{@code date}'s resolved time range: {@code date < today} (in {@code viewerZoneId}) is
     *       silently clamped to today's own semantics (never a 400, never simply ignored);
     *       {@code date == today} resolves to {@code [now(), dayEnd(today))}, excluding sessions
     *       that already started earlier today; {@code date > today} resolves to the plain
     *       {@code [dayStart(date), dayEnd(date))} window.</li>
     *   <li>{@code ONGOING} dropped from the default {@code statuses}; an explicit list naming it
     *       is never a 400 (unlike a genuinely invalid value) — it's silently stripped, falling
     *       back to the default only if stripping empties the list entirely.</li>
     *   <li>{@code startTimeFilter}/{@code startTime} are no longer required to be given
     *       together: {@code startTime} alone defaults the direction to {@code AFTER_OR_EQUAL};
     *       {@code startTimeFilter} alone has no effect (same as neither being given).</li>
     * </ul>
     * Results are always sorted {@code scheduledStart ASC}, then remaining open slots {@code ASC},
     * then {@code createdAt ASC}, regardless of the caller's own {@code Pageable} sort (ignored,
     * same as {@code getUpcomingSessions}/{@code getSessionHistory}). Default page size is
     * {@code 10} (SESSION-37; was {@code 20}).
     *
     * <p>SESSION-35: {@code date}'s day boundaries/floor and {@code startTimeFilter}/
     * {@code startTime}'s time-of-day comparison are both evaluated in {@code viewerZoneId}
     * (nullable, an IANA zone id, falling back to {@code "UTC"} when omitted) — a "sessions
     * starting before 9am" filter is inherently caller-relative, not server-relative (see
     * {@code SessionRepository.findDiscoverSessions}' Javadoc for the query-side detail). Invalid
     * (unparseable) {@code viewerZoneId} values are rejected with a {@code BadRequestException}.
     */
    Page<SessionResponse> discoverSessions(
            UUID callerId, Long sportId, String title, Long locationId, Integer minOpenSlots,
            FeeType feeType, Long maxFeeAmountVnd, LocalDate date,
            StartTimeFilter startTimeFilter, LocalTime startTime, String viewerZoneId,
            List<SessionStatus> statuses, Pageable pageable);

    /**
     * Sessions (standalone or group-linked) the caller currently has a JOINED participant row
     * for. {@code status} null returns every status in one page (CLIENT-SESSION-6's single
     * "My sessions" panel, avoiding a 4-call fan-out across SCHEDULED/ONGOING/COMPLETED/
     * CANCELLED); a given status restricts to just that one, same as before this parameter
     * became optional.
     */
    Page<SessionResponse> getJoinedSessions(UUID userId, SessionStatus status, Pageable pageable);

    /**
     * SESSION-10/A17 — the only path to a session's comment thread; {@code post-impl}'s own {@code
     * PostGate} makes the underlying {@code SESSION_POST} unconditionally unavailable via {@code
     * /api/posts/**}, so this module owns both the authorization (participant status —
     * JOINED/REQUESTED/INVITED — or, for a group-linked session, group membership; the ADR §6
     * widened rule) and the delegation to {@code post-api}'s bypass method
     * ({@code CommentService.createSessionComment}, which skips {@code PostGate}). Throws {@code
     * ResourceNotFoundException} if the session doesn't exist or its parent group is inactive,
     * {@code ForbiddenException} if it exists but {@code userId} isn't authorized.
     */
    CommentResponse createSessionComment(Long sessionId, UUID userId, CreateCommentRequest request);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    Page<CommentResponse> getSessionComments(Long sessionId, UUID callerId, Pageable pageable);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    void likeSessionComment(Long sessionId, Long commentId, UUID userId);

    /** Same authorization/delegation contract as {@link #createSessionComment}. */
    void unlikeSessionComment(Long sessionId, Long commentId, UUID userId);

    /**
     * Like the session itself (its {@code SESSION_POST} anchor) — same authorization contract as
     * {@link #createSessionComment}, delegating to {@code post-api}'s {@code
     * PostService.likeSessionPost} bypass method.
     */
    void likeSession(Long sessionId, UUID userId);

    /** Same authorization/delegation contract as {@link #likeSession}. */
    void unlikeSession(Long sessionId, UUID userId);

    /**
     * Distinct participant ids for one session matching any of {@code participantStatuses} —
     * batch, no-N+1-shaped lookup for {@code notification-impl}'s fan-out recipient resolution
     * (NTF-2), same shape as {@code post-api}'s {@code getDistinctCommenterIds}.
     *
     * <p>Two independent filters, both required from the caller — there is deliberately no
     * default for either:
     * <ul>
     *   <li>{@code participantStatuses} — which participants of the session are recipients
     *       (e.g. {@code JOINED} only, vs. {@code JOINED}/{@code REQUESTED}/{@code INVITED}).</li>
     *   <li>{@code allowedSessionStatuses} — which session lifecycle states fan out at all.
     *       If the session's own status isn't in this list, an empty list is returned
     *       <em>without querying participants</em>.</li>
     * </ul>
     *
     * <p>SESSION-20 made the second filter an explicit parameter. It was previously hardcoded to
     * {@code (SCHEDULED, ONGOING)} inside this method, which silently swallowed every
     * {@code session.comment.created} fan-out on a {@code COMPLETED} session even though
     * {@code SessionGate} permits commenting there (post-game recap) — the caller had no way to
     * see, let alone override, the rule it was subject to. Each caller now declares its own set;
     * see {@code notification-impl}'s {@code SessionEventsConsumer} constants.
     *
     * <p>Also returns an empty list if the session doesn't exist, for any status list.
     */
    List<UUID> getParticipantIdsByStatuses(Long sessionId,
                                           List<ParticipantStatus> participantStatuses,
                                           List<SessionStatus> allowedSessionStatuses);

    /**
     * Batch title lookup, no-N+1-shaped like {@code getParticipantIdsByStatuses} — for
     * {@code notification-impl}'s {@code entityTitle} enrichment (NTF-4), resolving many
     * {@code entityId}s from one page of notifications in a single call rather than one
     * {@code getSession} per row. Missing ids are simply absent from the returned map, mirroring
     * {@code user-api}'s {@code getUsersByIds} semantics — no exception thrown.
     */
    Map<Long, String> getSessionTitlesByIds(List<Long> sessionIds);
}

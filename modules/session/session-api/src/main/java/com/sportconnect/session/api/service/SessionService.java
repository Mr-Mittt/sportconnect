package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionDiscoverDateCountsResponse;
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

    /**
     * callerId (SESSION-9) resolves SessionResponse.callerParticipation — the caller's own
     * SessionParticipant row for this session, or null if they have none.
     *
     * <p>SESSION-40: gated via {@code SessionDetailGate} — previously ungated entirely.
     * Availability: the session exists and, if group-linked, its parent group is still active
     * (else NotFoundException). Visibility: {@code isPublic}, or (standalone) the caller holds a
     * JOINED/REQUESTED/INVITED participant row, or (group-linked) the caller is a member of the
     * parent group (else ForbiddenException). See {@code SessionDetailGate}'s own Javadoc for why
     * this differs from {@code SessionGate} (comments/likes).
     */
    SessionResponse getSession(Long sessionId, UUID callerId);

    /**
     * SESSION-40 (scope addition, 2026-09-22): member-only regardless of the group's own
     * public/private flag — widened from the previous {@code GroupService.getGroup(groupId,
     * currentUserId)} delegation, which only gated a <em>private</em> group (a public group's
     * sessions were listable by any authenticated user). Throws BadRequestException for a
     * non-member, whether the group is public, private, non-existent, or inactive —
     * {@code GroupService.isGroupMember} returns false uniformly for all of those, and this
     * deliberately doesn't distinguish them (doesn't leak group existence to a non-member).
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
     *
     * <p>SESSION-43: {@code sportId} (nullable) narrows to that sport's sessions; {@code null} means
     * all sports (what the {@code UpcomingMatches} rail needs). Plain equality — deliberately
     * <b>not</b> gated on the caller's active {@code UserSportProfile}s the way {@code
     * discoverSessions}' {@code sportId} is, since this list is already scoped by the caller's own
     * participant row: a user who dropped a sport profile still sees sessions they'd already joined.
     * An unknown {@code sportId} yields an empty page, not an error.
     */
    Page<SessionResponse> getUpcomingSessions(
            UUID userId, LocalDate date, String viewerZoneId, Long sportId, Pageable pageable);

    /**
     * SESSION-42 — "my pending requests": every session (standalone or group-linked) where the
     * caller currently holds a {@code REQUESTED} participant row, restricted to
     * {@code Session.status IN (PREPARING, SCHEDULED, ONGOING)} — the same status set {@link
     * #getUpcomingSessions} uses, since a {@code REQUESTED} row is never auto-cleared when a
     * session starts and must stay visible through {@code ONGOING} too. Sorted
     * {@code scheduledStart ASC} with the same {@code PREPARING}→{@code SCHEDULED}→
     * {@code ONGOING} tiebreak, non-caller-overridable — same contract as {@link
     * #getUpcomingSessions}.
     *
     * <p><b>Known gap, not handled here:</b> a {@code REQUESTED} row for a session that later goes
     * {@code CANCELLED}/{@code COMPLETED} is never auto-cleared and isn't covered by this method or
     * {@link #getSessionHistory} ({@code JOINED}-only) — accepted, pre-existing gap.
     */
    Page<SessionResponse> getRequestedSessions(UUID userId, Pageable pageable);

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
     *
     * <p>SESSION-43: {@code sportId} (required, non-null) restricts to that sport's sessions — plain
     * equality, no active-sport-profile gate (see {@link #getUpcomingSessions}). An unknown
     * {@code sportId} yields an empty page, not an error.
     */
    Page<SessionResponse> getSessionHistory(
            UUID userId, LocalDate date, String viewerZoneId, Long sportId, Pageable pageable);

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
     *
     * <p>SESSION-43: {@code sportId} (required, non-null) restricts the counted sessions to that
     * sport, so the per-date counts, {@code hasMore} and the {@code before} cursor all agree with
     * {@link #getSessionHistory} for the same sport — a date holding only other sports' sessions
     * never appears. Plain equality, no active-sport-profile gate.
     */
    SessionHistoryDatesResponse getSessionHistoryDates(
            UUID userId, int dateCount, LocalDate before, String viewerZoneId, Long sportId);

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
     * {@code title} (case-insensitive substring match), {@code locationId} (multi-value,
     * OR-combined — a session qualifies if its {@code locationId} is any of the given values;
     * widened from a single-value exact match on 2026-09-22 for parity with {@code
     * getSessionDiscoverDateCounts}, which shipped the multi-value shape first),
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
            UUID callerId, Long sportId, String title, List<Long> locationIds, Integer minOpenSlots,
            FeeType feeType, Long maxFeeAmountVnd, LocalDate date,
            StartTimeFilter startTimeFilter, LocalTime startTime, String viewerZoneId,
            List<SessionStatus> statuses, Pageable pageable);

    /**
     * SESSION-39 — per-date counts of {@link #discoverSessions}-shaped results across a small,
     * capped window/list of dates (no session data, no pagination) — the data a UI needs to render
     * Discover's date-section headers before drilling into one specific day. Shares
     * {@link #discoverSessions}'s entire gating/filter set (sport, title, fee, {@code
     * startTimeFilter}/{@code startTime}, {@code statuses}) except {@code date} and pagination, so
     * a returned count stays accurate against what {@code discoverSessions} would actually show on
     * drill-down — this is a live query, never a cache.
     *
     * <p><b>{@code locationIds} (scope change, 2026-09-22):</b> unlike {@code discoverSessions}'s
     * single-value {@code locationId} exact match, this endpoint accepts multiple values,
     * OR-combined — a session qualifies if its {@code locationId} is any of the given values.
     * {@code sportId} stays single-value, unchanged from {@code discoverSessions}.
     *
     * <p><b>{@code dates} semantics:</b>
     * <ul>
     *   <li>Omitted/empty — today and the next 7 days (8 calendar days total, in the resolved
     *       {@code viewerZoneId}).</li>
     *   <li>Given — any date strictly before today (in {@code viewerZoneId}) is silently dropped,
     *       same clamp/ignore spirit as {@code discoverSessions}'s own {@code date} handling. If
     *       every given date is in the past, the survivor list is empty and this returns an empty
     *       {@code counts} list — no query is made, and the default window is <em>not</em>
     *       substituted (2026-09-22 user decision).</li>
     *   <li>More than 8 dates given is rejected by the controller with a
     *       {@code BadRequestException} before this method is ever called — an explicit 400, not a
     *       silent truncation.</li>
     * </ul>
     * Each survivable date's own window matches {@code discoverSessions}' per-day boundary logic:
     * {@code date == today} → {@code [now(), dayEnd(today))} (excludes sessions already started
     * today); {@code date > today} → the plain {@code [dayStart(date), dayEnd(date))} window.
     *
     * <p><b>{@code counts} always includes every date in the effective window/list</b>, even a date
     * with zero matching sessions — the underlying query's {@code GROUP BY} naturally omits empty
     * buckets entirely, so this method explicitly backfills any missing date with
     * {@code count = 0} before returning, rather than relying on the query's own row set.
     *
     * <p>Mirrors {@link #discoverSessions}'s "caller has no active sport profile for {@code
     * sportId}, or zero active profiles at all" behavior — the effective window/list is still
     * computed and returned with every date at {@code count = 0}, no query is made.
     *
     * <p>{@code viewerZoneId} (nullable, an IANA zone id, falling back to {@code "UTC"} when
     * omitted) is the zone every date boundary and {@code startTimeFilter}/{@code startTime}'s
     * time-of-day comparison is evaluated in — same contract as {@link #discoverSessions}. Invalid
     * (unparseable) values are rejected with a {@code BadRequestException}.
     */
    SessionDiscoverDateCountsResponse getSessionDiscoverDateCounts(
            UUID callerId, Long sportId, String title, List<Long> locationIds, Integer minOpenSlots,
            FeeType feeType, Long maxFeeAmountVnd, List<LocalDate> dates,
            StartTimeFilter startTimeFilter, LocalTime startTime, String viewerZoneId,
            List<SessionStatus> statuses);

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

    /**
     * SESSION-38 — event-driven replacement for the old hourly full-group-scan sweep. Called by
     * {@code group-impl} right after {@code updateGroupRecurrence}/{@code updateGroupSettings}
     * saves, on the chance that save just made this group eligible for auto-generation. A no-op
     * (never throws for these cases) if the group isn't found, {@code autoGenerateSessions} is
     * false, the recurrence rule is incomplete, or the next occurrence already exists — the caller
     * doesn't need to pre-check any of that itself. Idempotent, like every other generation path in
     * this domain — safe to call more than once for the same group.
     *
     * <p>The caller is responsible for failure isolation: a genuine failure (e.g. a
     * {@code LocationService} lookup error) propagates as an unchecked exception rather than being
     * swallowed here, since only the caller knows whether its own operation should still succeed.
     * {@code group-impl}'s caller catches and logs rather than letting it fail the enclosing
     * settings/recurrence update.
     */
    void generateNextOccurrenceForGroup(Long groupId);
}

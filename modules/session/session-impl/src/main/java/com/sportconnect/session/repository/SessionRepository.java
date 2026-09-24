package com.sportconnect.session.repository;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.Session;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, Long> {

    Page<Session> findByGroupId(Long groupId, Pageable pageable);

    boolean existsByGroupIdAndScheduledStart(Long groupId, Instant scheduledStart);

    /**
     * SCHEDULED sessions whose scheduledStart has arrived but scheduledEndAt hasn't yet — i.e.
     * ready to become ONGOING. A session with no scheduledEndAt never matches (null comparisons
     * are false in JPQL), which is intentional: it skips ONGOING and goes straight to COMPLETED
     * once scheduledStart passes, since there's no known end to be "ongoing" until. Batched via
     * Pageable so an unbounded backlog can't be loaded in one query.
     */
    @Query("SELECT s FROM Session s WHERE s.status = :status "
            + "AND s.scheduledStart <= :now AND s.scheduledEndAt > :now")
    Slice<Session> findSessionsToStart(
            @Param("status") SessionStatus status,
            @Param("now") Instant now,
            Pageable pageable);

    /**
     * Sessions in any of {@code statuses} whose effective end (scheduledEndAt, falling back to
     * scheduledStart when no duration was given) has passed — ready to become COMPLETED. Batched
     * via Pageable so an unbounded backlog can't be loaded in one query.
     */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND COALESCE(s.scheduledEndAt, s.scheduledStart) < :cutoff")
    Slice<Session> findSessionsToComplete(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("cutoff") Instant cutoff,
            Pageable pageable);

    /**
     * {@code PREPARING} sessions whose {@code scheduledStart} has passed without the creator
     * completing {@code locationId}/{@code feeType} — ready to be auto-cancelled (SESSION-24).
     * Same shape as {@link #findSessionsToStart}/{@link #findSessionsToComplete}: batched via
     * Pageable so an unbounded backlog can't be loaded in one query.
     */
    @Query("SELECT s FROM Session s WHERE s.status = :status AND s.scheduledStart <= :cutoff")
    Slice<Session> findUnpreparedSessionsToCancel(
            @Param("status") SessionStatus status,
            @Param("cutoff") Instant cutoff,
            Pageable pageable);

    /**
     * SESSION-25 — joinable standalone sessions for discover: open ({@code isPublic = true},
     * SESSION-37 — was {@code groupId IS NULL} until then, now a real stored column backing the
     * {@code idx_sessions_sport_id_standalone} partial index's predicate), status in
     * {@code statuses} (caller-narrowable subset of PREPARING/SCHEDULED/ONGOING), restricted to
     * {@code sportIds} (the caller's active-sport-profile gate, resolved by the caller), excluding
     * sessions the caller created and sessions the caller currently holds a participant row in
     * {@code excludedParticipantStatuses} for (a session the caller {@code LEFT} is eligible to
     * reappear). Every parameter below {@code sportIds} is an optional, AND-combined filter using
     * the {@code (:param IS NULL OR ...)} null-safe pattern ({@code
     * GroupRepository.searchPublicGroupsWithCounts} precedent) — a null value skips that condition
     * entirely.
     *
     * <p><b>SESSION-42:</b> {@code excludedParticipantStatuses} ({@code JOINED}/{@code REQUESTED}/
     * {@code INVITED} — the service always passes all three) is deliberately a separate parameter
     * from {@code joinedStatus} below, even though both used to be the same single value. {@code
     * joinedStatus} is still {@code JOINED}-only and unchanged — it feeds the {@code openSlots}/
     * {@code minOpenSlots} capacity-counting subqueries, which must count only genuinely joined
     * participants, never a pending request or an unaccepted invite. Widening {@code joinedStatus}
     * itself instead of splitting it would have silently undercounted capacity.
     *
     * <p>Returns {@code (Session, openSlots)} pairs rather than a plain {@code Session}: {@code
     * openSlots} (capacity minus initialSlot minus a correlated count of JOINED participants) is a
     * scalar subquery that must appear as a SELECT-list result variable to be legal in {@code
     * ORDER BY} per JPQL's grammar — it can't be inlined directly into the ORDER BY clause. The
     * caller ({@code SessionServiceImpl}) discards it; {@code mapToResponses} independently
     * recomputes participantCount via its own batch query, so this value is sort-only, never
     * returned to the client. {@code minOpenSlots} filters the same computed value: a session
     * qualifies when {@code openSlots - minOpenSlots > 0}.
     *
     * <p>{@code title} is a case-insensitive substring match ({@code LOWER}/{@code LIKE}, same
     * {@code CAST(:x AS string)} pattern as {@code GroupRepository}). {@code startTimeBeforeOrEqual}/
     * {@code startTimeAfterOrEqual} compare scheduledStart's time-of-day component — the service
     * passes at most one of the two populated, based on the caller's {@code startTimeFilter}
     * direction. {@code lowerBound}, when non-null, is the service's {@code now()} default
     * (skipped whenever the caller narrows by {@code date} or a start-time filter instead — see
     * {@code SessionService.discoverSessions}'s Javadoc). <b>SESSION-35 (2026-09-18):</b> the
     * service now always passes {@code null} here — {@code date} became a required param, so the
     * "caller supplied neither {@code date} nor a start-time filter" case this default existed
     * for can no longer happen. Left in the query rather than removed: a harmless, always-taken
     * {@code IS NULL} branch, not worth dropping a parameter from an otherwise-untouched query.
     *
     * <p><b>Every {@code :param IS NULL} check below is itself wrapped in a {@code CAST}</b> (e.g.
     * {@code CAST(:locationId AS long) IS NULL}, not bare {@code :locationId IS NULL}). Confirmed
     * necessary against the real dev Postgres: a bare {@code CAST(:lowerBound AS ...)}-less
     * {@code :lowerBound IS NULL} (a {@code LocalDateTime}/{@code timestamp} parameter) failed with
     * {@code "ERROR: could not determine data type of parameter $N"} at query execution — caught
     * only by an actual HTTP call against real Postgres, not by any mock-based Spock test.
     * Re-verified live afterward that {@code GroupRepository.searchPublicGroupsWithCounts}'s
     * similar-shaped un-cast {@code (:keyword IS NULL OR ...)} (a plain {@code String} parameter)
     * does <em>not</em> reproduce this against real data — Postgres's parameter-type ambiguity for
     * a bare {@code IS NULL} check is apparently sharper for temporal types than for
     * {@code String}, not a universal problem with the null-safe-filter idiom itself. Every
     * optional param here is cast regardless, defensively — harmless even where not strictly
     * required, and one less thing to have to reason about per-parameter.
     *
     * <p><b>A real, confirmed timezone bug, found by a permanent IT test
     * ({@code SessionDiscoverIntegrationTest}) and reproduced on both H2 and real Postgres, shapes
     * both the {@code date} filter and the {@code startTimeBeforeOrEqual}/
     * {@code startTimeAfterOrEqual} filters below.</b> This app sets {@code
     * hibernate.jdbc.time_zone: UTC} (root {@code application.yml}), which shifts every stored
     * {@code LocalDateTime} by the JVM's default-zone offset on write (e.g. {@code 18:00} local
     * becomes {@code 11:00} raw-stored, on a UTC+7 host) — but that shift is only <em>reapplied on
     * a plain attribute read</em> (confirmed: {@code SELECT s.scheduledStart} correctly returns
     * {@code 18:00}); a SQL function applied directly to the column in the same query reads the
     * raw, un-reapplied value instead (confirmed: {@code EXTRACT(HOUR FROM s.scheduledStart)} on
     * that same row returned {@code 11}, and {@code CAST(s.scheduledStart AS date)} on an
     * early-morning row returned the wrong calendar day entirely).
     *
     * <p>{@code date} sidesteps this: it's expressed as a half-open {@code [dayStart, dayEnd)}
     * range against the plain {@code s.scheduledStart} path expression — no cast at all — the
     * exact same pattern {@code findUpcomingSessionsByDate}/{@code findHistorySessionsByDate}
     * (SESSION-27) already use, there for index-usage reasons that happen to also avoid this bug.
     *
     * <p>{@code startTimeBeforeOrEqual}/{@code startTimeAfterOrEqual} can't avoid the {@code
     * EXTRACT} the same way — the whole point is a "time-of-day, any date" comparison, which has
     * no single {@code [start, end)} range. Two further attempts before landing on the fix below:
     * <ol>
     *   <li>A natively-bound {@code LocalTime}/{@code String} JDBC parameter compared via
     *       {@code CAST(s.scheduledStart AS time)}, in three variations, each failing a different
     *       way (wrong row sets, or a {@code "cannot cast bytea to time"} error) — none related to
     *       the timezone bug; a separate, independently confirmed JDBC/Hibernate binding
     *       unreliability for {@code time}-typed comparisons specifically.</li>
     *   <li>Once switched to {@code EXTRACT}-based {@code Integer} seconds-of-day (avoiding the
     *       {@code time} type entirely) and the timezone bug was root-caused: shifting the
     *       *parameter* by the JVM's offset to match the raw/UTC frame {@code EXTRACT} reads
     *       worked for most thresholds (e.g. noon) but inverted for others (e.g. {@code
     *       AFTER_OR_EQUAL 00:00} excluded an {@code 18:00} session) — shifting a value by a
     *       constant offset moves <em>where the 24-hour cycle wraps</em>, and a plain {@code >=}/
     *       {@code <=} on the shifted values stops being equivalent to the original comparison
     *       once either side crosses that new wrap point.</li>
     * </ol>
     * The fix: reconstruct the true wall-clock seconds-of-day <em>inside the query</em> instead —
     * {@code MOD(CAST(EXTRACT(...) + :zoneOffsetSeconds AS integer), 86400)} adds the JVM's UTC
     * offset back to the raw-read value and wraps it correctly via {@code MOD}, regardless of
     * where either side sits relative to any wrap point — then compares that reconstructed value
     * against the caller's <em>unconverted</em> {@code startTimeBeforeOrEqual}/
     * {@code startTimeAfterOrEqual}. The inner {@code CAST(... AS integer)} is required — Hibernate's
     * portable {@code mod()} function rejects non-{@code INTEGER} arguments, and {@code
     * EXTRACT(SECOND FROM ...)} returns a fractional value, making the un-cast sum a {@code Float}
     * (this actually broke Spring context startup entirely — {@code FunctionArgumentException},
     * caught only by running the IT suite, not by compiling); truncating to whole seconds is fine
     * here since the caller's {@code startTime} has no sub-second precision to preserve anyway.
     * Wrapped a second time ({@code MOD(x, 86400) + 86400, 86400}) since SQL {@code MOD} takes the
     * sign of the dividend — a negative intermediate sum (a west-of-UTC server zone) would
     * otherwise stay negative instead of wrapping to a positive time-of-day. {@code
     * zoneOffsetSeconds} is computed once in {@code SessionServiceImpl} ({@code ZoneId
     * .systemDefault()}'s current offset) and only non-null when at least one of the two is set.
     *
     * <p>A pre-existing, already-shipped instance of this same timezone bug was found in {@code
     * findHistoryDateCounts} below (SESSION-27) while investigating — flagged as a follow-up,
     * not fixed here (out of scope for this ticket). Fixed by SESSION-34, which replaced that
     * query's own bare {@code CAST} with an explicit, per-row {@code AT TIME ZONE} conversion.
     *
     * <p>An explicit {@code countQuery} is required (mirroring {@code
     * searchPublicGroupsWithCounts}) since Spring Data's automatic count-query derivation isn't
     * reliable for a multi-item {@code SELECT}.
     *
     * <p><b>SESSION-35 update:</b> {@code zoneOffsetSeconds} is now computed in
     * {@code SessionServiceImpl} from the caller's own resolved {@code viewerZoneId} (via
     * {@code resolveZone}), not {@code ZoneId.systemDefault()} — fixes the actual bug (every filter
     * was evaluated in the <em>server's</em> zone regardless of who was asking) for any caller in a
     * zone that doesn't observe DST (e.g. {@code Asia/Ho_Chi_Minh}), and for any caller whose
     * candidate sessions all fall in the same DST season as the moment of the request.
     *
     * <p><b>Tried and rejected: a real per-row {@code AT TIME ZONE} conversion</b> (would be
     * correct across DST unconditionally, unlike the offset-shift above). HQL has no {@code AT TIME
     * ZONE} operator — attempted the JPQL {@code function('timezone', :callerZone,
     * s.scheduledStart)} passthrough (Postgres's function-call equivalent of the operator), which
     * compiled but failed against H2 at query execution with
     * {@code org.hibernate.exception.SQLGrammarException: Function "timezone" not found} — H2
     * implements the {@code x AT TIME ZONE zone} operator (already used successfully by {@code
     * findHistoryDateCounts}'s native query) but not the {@code timezone(zone, x)} function-call
     * form Postgres also accepts. Getting the operator form would require converting this whole
     * query to {@code nativeQuery = true} with an explicit {@code @SqlResultSetMapping} (to keep
     * returning {@code Session} entities + the {@code openSlots} scalar, which native queries don't
     * auto-map) — judged not worth the size/risk of that rewrite for a residual gap this narrow;
     * revisit if it proves to matter in practice.
     *
     * <p><b>Known residual limitation (accepted, not fixed):</b> {@code zoneOffsetSeconds} reflects
     * {@code viewerZoneId}'s offset <em>at the moment of the request</em>, not each row's own date —
     * for a DST-observing zone, a candidate session on a date in the <em>other</em> DST season than
     * "now" is off by the DST delta (typically 1 hour); e.g. filtering in January (EST, UTC-5)
     * against a session already discoverable for next August (EDT, UTC-4) misjudges the threshold
     * by an hour. Same category of imprecision as the two-attempts history above, just against the
     * caller's zone instead of the server's. A true per-row fix needs the native-query rewrite
     * described above.
     *
     * <p><b>{@code locationIds}/{@code hasLocationIds} (post-SESSION-39 change, 2026-09-22):</b>
     * {@code locationId} became a multi-value, OR-combined filter here too — matching {@code
     * findDiscoverDateCounts}'s own {@code locationIds}/{@code hasLocationIds} shape (an explicit
     * boolean flag rather than a {@code :locationIds IS NULL} check, since binding a null
     * {@code List} to {@code IN :locationIds} has no proven-safe precedent in this codebase — the
     * service always passes a non-empty list, a harmless sentinel when the caller omits
     * {@code locationId}). Originally single-value ({@code s.locationId = :locationId}); widened
     * for parity once {@code SessionCount}'s own multi-value {@code locationId} shipped.
     */
    @Query(
        value = "SELECT s, (s.capacity - s.initialSlot - "
                + "    (SELECT COUNT(sp2) FROM SessionParticipant sp2 "
                + "        WHERE sp2.sessionId = s.id AND sp2.status = :joinedStatus)) AS openSlots "
                + "FROM Session s WHERE s.isPublic = true AND s.status IN :statuses "
                + "AND s.sportId IN :sportIds AND s.createdBy <> :callerId "
                + "AND s.id NOT IN (SELECT sp.sessionId FROM SessionParticipant sp "
                + "    WHERE sp.userId = :callerId AND sp.status IN :excludedParticipantStatuses) "
                + "AND (CAST(:lowerBound AS timestamp) IS NULL OR s.scheduledStart >= :lowerBound) "
                + "AND (CAST(:title AS string) IS NULL OR LOWER(s.title) LIKE LOWER(CONCAT('%', CAST(:title AS string), '%'))) "
                + "AND (:hasLocationIds = false OR s.locationId IN :locationIds) "
                + "AND (CAST(:feeType AS string) IS NULL OR s.feeType = :feeType) "
                + "AND (CAST(:maxFeeAmountVnd AS long) IS NULL OR s.feeAmountVnd <= :maxFeeAmountVnd) "
                + "AND (CAST(:dayStart AS timestamp) IS NULL OR (s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd)) "
                + "AND (CAST(:startTimeBeforeOrEqual AS integer) IS NULL OR "
                + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600 + EXTRACT(MINUTE FROM s.scheduledStart) * 60 "
                + "        + EXTRACT(SECOND FROM s.scheduledStart) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) <= :startTimeBeforeOrEqual) "
                + "AND (CAST(:startTimeAfterOrEqual AS integer) IS NULL OR "
                + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600 + EXTRACT(MINUTE FROM s.scheduledStart) * 60 "
                + "        + EXTRACT(SECOND FROM s.scheduledStart) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) >= :startTimeAfterOrEqual) "
                + "AND (CAST(:minOpenSlots AS integer) IS NULL OR (s.capacity - s.initialSlot - "
                + "    (SELECT COUNT(sp3) FROM SessionParticipant sp3 "
                + "        WHERE sp3.sessionId = s.id AND sp3.status = :joinedStatus)) - :minOpenSlots > 0) "
                + "ORDER BY s.scheduledStart ASC, openSlots ASC, s.createdAt ASC",
        countQuery = "SELECT COUNT(s) FROM Session s WHERE s.isPublic = true AND s.status IN :statuses "
                + "AND s.sportId IN :sportIds AND s.createdBy <> :callerId "
                + "AND s.id NOT IN (SELECT sp.sessionId FROM SessionParticipant sp "
                + "    WHERE sp.userId = :callerId AND sp.status IN :excludedParticipantStatuses) "
                + "AND (CAST(:lowerBound AS timestamp) IS NULL OR s.scheduledStart >= :lowerBound) "
                + "AND (CAST(:title AS string) IS NULL OR LOWER(s.title) LIKE LOWER(CONCAT('%', CAST(:title AS string), '%'))) "
                + "AND (:hasLocationIds = false OR s.locationId IN :locationIds) "
                + "AND (CAST(:feeType AS string) IS NULL OR s.feeType = :feeType) "
                + "AND (CAST(:maxFeeAmountVnd AS long) IS NULL OR s.feeAmountVnd <= :maxFeeAmountVnd) "
                + "AND (CAST(:dayStart AS timestamp) IS NULL OR (s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd)) "
                + "AND (CAST(:startTimeBeforeOrEqual AS integer) IS NULL OR "
                + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600 + EXTRACT(MINUTE FROM s.scheduledStart) * 60 "
                + "        + EXTRACT(SECOND FROM s.scheduledStart) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) <= :startTimeBeforeOrEqual) "
                + "AND (CAST(:startTimeAfterOrEqual AS integer) IS NULL OR "
                + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600 + EXTRACT(MINUTE FROM s.scheduledStart) * 60 "
                + "        + EXTRACT(SECOND FROM s.scheduledStart) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) >= :startTimeAfterOrEqual) "
                + "AND (CAST(:minOpenSlots AS integer) IS NULL OR (s.capacity - s.initialSlot - "
                + "    (SELECT COUNT(sp3) FROM SessionParticipant sp3 "
                + "        WHERE sp3.sessionId = s.id AND sp3.status = :joinedStatus)) - :minOpenSlots > 0)"
    )
    Page<Object[]> findDiscoverSessions(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("sportIds") List<Long> sportIds,
            @Param("callerId") UUID callerId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
            @Param("excludedParticipantStatuses") List<ParticipantStatus> excludedParticipantStatuses,
            @Param("lowerBound") Instant lowerBound,
            @Param("title") String title,
            @Param("hasLocationIds") boolean hasLocationIds,
            @Param("locationIds") List<Long> locationIds,
            @Param("feeType") FeeType feeType,
            @Param("maxFeeAmountVnd") Long maxFeeAmountVnd,
            @Param("dayStart") Instant dayStart,
            @Param("dayEnd") Instant dayEnd,
            @Param("startTimeBeforeOrEqual") Integer startTimeBeforeOrEqual,
            @Param("startTimeAfterOrEqual") Integer startTimeAfterOrEqual,
            @Param("zoneOffsetSeconds") Integer zoneOffsetSeconds,
            @Param("minOpenSlots") Integer minOpenSlots,
            Pageable pageable);

    /**
     * Sessions (standalone or group-linked) the caller currently has a JOINED participant row
     * for, restricted to a single {@code status} — backs the matches page's per-status sections
     * (e.g. "joined + ongoing", "joined + completed").
     */
    @Query("SELECT s FROM Session s WHERE s.status = :status "
            + "AND s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status = :joinedStatus)")
    Page<Session> findJoinedSessionsByStatus(
            @Param("status") SessionStatus status,
            @Param("userId") UUID userId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
            Pageable pageable);

    /**
     * Same as {@link #findJoinedSessionsByStatus} but across every status — CLIENT-SESSION-6's
     * single "My sessions" panel needs the caller's whole joined history/upcoming in one page
     * rather than fanning out one call per {@code SessionStatus}.
     */
    @Query("SELECT s FROM Session s "
            + "WHERE s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status = :joinedStatus)")
    Page<Session> findJoinedSessions(
            @Param("userId") UUID userId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
            Pageable pageable);

    /**
     * SESSION-27 — replaces {@code findByCreatedByAndGroupIdIsNull}/{@code GET /sessions/mine}.
     * Every session (standalone or group-linked) where the caller currently has a participant row
     * in {@code participantStatuses}, restricted to {@code statuses} ({@code PREPARING}/
     * {@code SCHEDULED}/{@code ONGOING}). Originally always called with {@code JOINED}/
     * {@code INVITED} (never {@code REQUESTED}) for {@code /upcoming} — genuinely generic over
     * {@code participantStatuses} already, so <b>SESSION-42</b> reuses this exact method unchanged
     * for {@code GET /api/sessions/requested} too, passing {@code List.of(REQUESTED)} instead; no
     * new repository method needed for that endpoint.
     *
     * <p><b>SESSION-43:</b> {@code sportId} is optional — {@code null} means no sport filter (the
     * all-sports {@code UpcomingMatches} rail and {@code /requested} pass {@code null}). The
     * {@code CAST(:sportId AS long) IS NULL} guard tests whether the <em>param</em> was omitted, not
     * the column ({@code sessions.sport_id} is {@code NOT NULL}); same pattern as
     * {@code findDiscoverSessions}'s optional filters. Plain equality only — no active-sport-profile
     * gate like {@code /discover}'s, since these rows are already scoped by the caller's own
     * participant row.
     *
     * <p>{@code ORDER BY} is static and deliberately ignores whatever {@code Sort} the caller's
     * {@code Pageable} carries (the service passes an unsorted one) — {@code scheduledStart ASC}
     * primary, then a {@code PREPARING}→{@code SCHEDULED}→{@code ONGOING} tiebreaker for sessions
     * sharing the exact same {@code scheduledStart}, so pagination stays deterministic across that
     * tie instead of depending on Postgres's unspecified tie order.
     */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND (CAST(:sportId AS long) IS NULL OR s.sportId = :sportId) "
            + "AND s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status IN :participantStatuses) "
            + "ORDER BY s.scheduledStart ASC, "
            + "CASE WHEN s.status = :preparingStatus THEN 0 WHEN s.status = :scheduledStatus THEN 1 ELSE 2 END ASC")
    Page<Session> findUpcomingSessions(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("userId") UUID userId,
            @Param("participantStatuses") List<ParticipantStatus> participantStatuses,
            @Param("preparingStatus") SessionStatus preparingStatus,
            @Param("scheduledStatus") SessionStatus scheduledStatus,
            @Param("sportId") Long sportId,
            Pageable pageable);

    /** Same as {@link #findUpcomingSessions} narrowed to one calendar day
     * ({@code [dayStart, dayEnd)}, a half-open range rather than a date cast, so the existing
     * {@code (status, scheduled_start)} index still applies). */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd "
            + "AND (CAST(:sportId AS long) IS NULL OR s.sportId = :sportId) "
            + "AND s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status IN :participantStatuses) "
            + "ORDER BY s.scheduledStart ASC, "
            + "CASE WHEN s.status = :preparingStatus THEN 0 WHEN s.status = :scheduledStatus THEN 1 ELSE 2 END ASC")
    Page<Session> findUpcomingSessionsByDate(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("userId") UUID userId,
            @Param("participantStatuses") List<ParticipantStatus> participantStatuses,
            @Param("preparingStatus") SessionStatus preparingStatus,
            @Param("scheduledStatus") SessionStatus scheduledStatus,
            @Param("dayStart") Instant dayStart,
            @Param("dayEnd") Instant dayEnd,
            @Param("sportId") Long sportId,
            Pageable pageable);

    /**
     * SESSION-27 — every session (standalone or group-linked) where the caller currently has a
     * {@code JOINED} participant row (not {@code INVITED} — an invite never accepted isn't "my
     * history"), restricted to {@code statuses} ({@code CANCELLED}/{@code COMPLETED}), narrowed to
     * one calendar day (same half-open range as {@link #findUpcomingSessionsByDate}). Sorted
     * {@code scheduledStart DESC}, static like {@link #findUpcomingSessions} — the service passes
     * an unsorted {@code Pageable}. SESSION-43: {@code sportId} is required (plain equality, no
     * optional-param guard) — see {@link #findUpcomingSessions} for why there is no
     * active-sport-profile gate.
     */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd "
            + "AND s.sportId = :sportId "
            + "AND s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status = :joinedStatus) "
            + "ORDER BY s.scheduledStart DESC")
    Page<Session> findHistorySessionsByDate(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("userId") UUID userId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
            @Param("dayStart") Instant dayStart,
            @Param("dayEnd") Instant dayEnd,
            @Param("sportId") Long sportId,
            Pageable pageable);

    /**
     * SESSION-27/34 — the caller's last {@code limit} distinct calendar dates (most-recent-first) on
     * which they have at least one {@code CANCELLED}/{@code COMPLETED} session they were
     * {@code JOINED} to, each with its own count. {@code before} (nullable) restricts to dates
     * strictly earlier than it, for paging further back. SESSION-43: only sessions of {@code
     * sportId} (required) are counted, so the counts and the {@code before} cursor stay consistent
     * with {@link #findHistorySessionsByDate}. Native — {@code GROUP BY} a date cast
     * with a {@code LIMIT} has no portable JPQL equivalent; same precedent as {@code
     * ProcessedMessageRepository.insertIfAbsent}, this module's Postgres-only tables. The service
     * requests {@code dateCount + 1} rows so it can compute {@code hasMore} and trim to
     * {@code dateCount}. {@code statuses}/{@code joinedStatus} are passed as enum {@code name()}
     * strings — a native query has no {@code @Enumerated} context to bind a Java enum directly.
     *
     * <p><b>SESSION-34:</b> buckets every row by {@code zoneId} — a single caller-resolved IANA zone
     * (the caller's own current zone when the request supplied one, else {@code "UTC"}; the service
     * layer resolves which before calling this method) — via an explicit {@code AT TIME ZONE}
     * conversion, replacing the previously-reverted JVM-offset point-fix (SESSION-31). A personal
     * history reads oddest when a date is pinned to somewhere the viewer no longer is (a completed
     * session could even show as "in the future" relative to the viewer's own current clock), so
     * this deliberately does <em>not</em> bucket by the session's own location/origin zone —
     * {@code zoneId} is a single value shared by every row in one call, not resolved per row, so
     * there's no join to another domain's table and no per-row unresolved-zone case to handle;
     * {@code zoneId} being non-null is guaranteed by the caller (either a validated caller-supplied
     * value or the {@code "UTC"} literal), so this query never needs to exclude a row.
     *
     * <p><b>Why {@code TO_CHAR(... , 'YYYY-MM-DD')} instead of a direct {@code CAST(... AS date)}
     * on the {@code AT TIME ZONE} result:</b> confirmed empirically (a standalone H2 script, not
     * guessed) that H2 2.2.224's {@code CAST(timestamptz AS timestamp)} — the implicit step inside
     * {@code CAST(... AS date)} — re-normalizes the value through the JDBC session's own default
     * zone instead of preserving the {@code AT TIME ZONE}-shifted wall-clock fields the way real
     * Postgres does, silently discarding the conversion this query depends on (`AT TIME ZONE`
     * itself works correctly in H2 — only the subsequent narrowing cast mishandles it). Routing
     * through {@code TO_CHAR} avoids that narrowing step entirely and was verified to produce
     * identical, correct results on both engines — H2 (2.2.224, {@code MODE=PostgreSQL}) and real
     * Postgres.
     *
     * <p><b>Why {@code GROUP BY 1} (ordinal) instead of repeating the {@code CAST(TO_CHAR(...))}
     * expression:</b> a real, narrower H2 quirk than the one above, found via this exact query
     * through Hibernate (not reproducible via a hand-written JDBC {@code PreparedStatement} sending
     * the identical SQL text — isolated to Hibernate's own native-query execution path, cause not
     * further isolated within this ticket's time budget): H2 rejected {@code GROUP BY
     * CAST(TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, ...) AS date)} with {@code Column
     * "s.scheduled_start" must be in the GROUP BY list}, even though that expression is textually
     * identical to the one in the {@code SELECT} list. Grouping by the {@code SELECT} list's ordinal
     * position instead sidesteps expression-equivalence checking entirely — verified correct on both
     * H2 and real Postgres (both support {@code GROUP BY <ordinal>} as a standard extension).
     */
    @Query(value = "SELECT CAST(TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') AS date) "
            + "    AS sessionDate, COUNT(*) AS count "
            + "FROM sessions s "
            + "WHERE s.status IN (:statuses) "
            + "AND s.sport_id = :sportId "
            + "AND s.id IN (SELECT sp.session_id FROM session_participants sp "
            + "    WHERE sp.user_id = :userId AND sp.status = :joinedStatus) "
            + "AND (CAST(:before AS date) IS NULL OR "
            + "    CAST(TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') AS date) "
            + "    < CAST(:before AS date)) "
            + "GROUP BY 1 "
            + "ORDER BY sessionDate DESC "
            + "LIMIT :limit",
            nativeQuery = true)
    List<SessionDateCountProjection> findHistoryDateCounts(
            @Param("statuses") List<String> statuses,
            @Param("userId") UUID userId,
            @Param("joinedStatus") String joinedStatus,
            @Param("before") LocalDate before,
            @Param("zoneId") String zoneId,
            @Param("sportId") Long sportId,
            @Param("limit") int limit);

    interface SessionDateCountProjection {
        LocalDate getSessionDate();
        Long getCount();
    }

    /**
     * SESSION-39 — {@code discoverSessions}-shaped population ({@code is_public = true},
     * {@code status IN}, {@code sport_id IN}, caller-exclusion — own sessions and sessions the
     * caller currently holds a participant row in {@code excludedParticipantStatuses} for
     * ({@code JOINED}/{@code REQUESTED}/{@code INVITED}, all three — see {@link
     * #findDiscoverSessions}'s Javadoc for why this is a separate parameter from {@code
     * joinedStatus}, which stays {@code JOINED}-only for the capacity subquery below) — plus every
     * optional filter {@code discoverSessions} has except {@code date}), bucketed per calendar date
     * instead of returning session rows. Native, matching {@link
     * #findHistoryDateCounts}'s style ({@code AT TIME ZONE} + {@code TO_CHAR} + ordinal
     * {@code GROUP BY 1} — see that method's Javadoc for the H2-vs-Postgres gotchas both queries
     * share) — this is the ADR's benchmarked "Query C" shape
     * ({@code documentation/md/adr/DISCOVER_SCHEDULED_START_FILTER_ADR.md} §0c/§0d), re-verified at
     * SESSION-39 pickup against the redesigned {@code idx_sessions_sport_id_standalone} (SESSION-37).
     *
     * <p><b>{@code dateStrings}/{@code todayStr}</b> — the service layer resolves the effective,
     * already-past-filtered date list to {@code 'YYYY-MM-DD'} strings in {@code zoneId} once, and
     * this query restricts to exactly those buckets via {@code TO_CHAR(...) IN (:dateStrings)}
     * (each survivor date's own {@code [dayStart, dayEnd)} window in {@code zoneId} is exactly what
     * that date string denotes — no separate per-date {@code Instant} range needed). The one
     * exception is {@code todayStr}: a session already started earlier today must still be
     * excluded (matching {@code discoverSessions}' {@code date == today → [now(), dayEnd)} rule),
     * which the date-string equality alone can't express — the trailing {@code <> :todayStr OR
     * >= :nowInstant} clause adds that floor back in for the one bucket it applies to.
     *
     * <p><b>{@code lowerBound}/{@code upperBound}</b> — a loose {@code scheduled_start} envelope
     * spanning every survivor date (min date's lower bound to max date's exclusive upper bound),
     * mirroring the ADR's Query C test — a prune helper for the planner, not load-bearing for
     * correctness (the {@code TO_CHAR(...) IN (...)} clause alone is already exact).
     *
     * <p><b>{@code locationIds}/{@code hasLocationIds} (scope change, 2026-09-22; widened to
     * {@code discoverSessions} too the same day):</b> multi-value, OR-combined via
     * {@code location_id IN (:locationIds)} — originally introduced here first (this endpoint
     * shipped it before {@code discoverSessions} did), now the same shape both endpoints share.
     * {@code hasLocationIds} is an explicit boolean flag rather than a {@code :locationIds IS NULL}
     * check — binding a null {@code List} to a native {@code IN (:param)} clause has no
     * proven-safe precedent in this codebase (every existing native/JPQL {@code IN (:list)} usage
     * here is guaranteed non-empty before the query runs), so the service always passes a
     * non-empty list — a harmless {@code List.of(-1L)} sentinel (never a real id) when the caller
     * omitted {@code locationId} — and this flag controls whether the clause is actually applied.
     *
     * <p>Every remaining optional filter ({@code title}, {@code feeType}, {@code maxFeeAmountVnd},
     * {@code minOpenSlots}, {@code startTimeBeforeOrEqual}/{@code startTimeAfterOrEqual} +
     * {@code zoneOffsetSeconds}) is identical in shape and semantics to {@code discoverSessions}'
     * own JPQL clauses (see {@link #findDiscoverSessions}' Javadoc) — same defensive
     * {@code CAST(:param AS type) IS NULL} guard on every optional scalar, same
     * {@code MOD}-based wall-clock reconstruction for the time-of-day comparison (the ADR's
     * benchmarked Query C keeps this mechanism rather than a direct {@code AT TIME ZONE} extraction
     * for the time component, even though this query is native — see the ADR's §0c for why: it's
     * the already-tested shape, not an unverified "improvement").
     */
    @Query(value = "SELECT CAST(TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') AS date) "
            + "    AS sessionDate, COUNT(*) AS count "
            + "FROM sessions s "
            + "WHERE s.is_public = true AND s.status IN (:statuses) AND s.sport_id IN (:sportIds) "
            + "AND s.created_by <> :callerId "
            + "AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp "
            + "    WHERE sp.user_id = :callerId AND sp.status IN (:excludedParticipantStatuses)) "
            + "AND s.scheduled_start >= :lowerBound AND s.scheduled_start < :upperBound "
            + "AND TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') IN (:dateStrings) "
            + "AND (TO_CHAR(s.scheduled_start AT TIME ZONE :zoneId, 'YYYY-MM-DD') <> :todayStr "
            + "    OR s.scheduled_start >= :nowInstant) "
            + "AND (CAST(:title AS text) IS NULL OR LOWER(s.title) LIKE LOWER(CONCAT('%', CAST(:title AS text), '%'))) "
            + "AND (:hasLocationIds = false OR s.location_id IN (:locationIds)) "
            + "AND (CAST(:feeType AS text) IS NULL OR s.fee_type = :feeType) "
            + "AND (CAST(:maxFeeAmountVnd AS bigint) IS NULL OR s.fee_amount_vnd <= :maxFeeAmountVnd) "
            + "AND (CAST(:minOpenSlots AS integer) IS NULL OR (s.capacity - s.initial_slot - "
            + "    (SELECT COUNT(*) FROM session_participants sp3 "
            + "        WHERE sp3.session_id = s.id AND sp3.status = :joinedStatus)) - :minOpenSlots > 0) "
            + "AND (CAST(:startTimeBeforeOrEqual AS integer) IS NULL OR "
            + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60 "
            + "        + EXTRACT(SECOND FROM s.scheduled_start) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) <= :startTimeBeforeOrEqual) "
            + "AND (CAST(:startTimeAfterOrEqual AS integer) IS NULL OR "
            + "    MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60 "
            + "        + EXTRACT(SECOND FROM s.scheduled_start) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400) >= :startTimeAfterOrEqual) "
            + "GROUP BY 1",
            nativeQuery = true)
    List<SessionDateCountProjection> findDiscoverDateCounts(
            @Param("statuses") List<String> statuses,
            @Param("sportIds") List<Long> sportIds,
            @Param("callerId") UUID callerId,
            @Param("joinedStatus") String joinedStatus,
            @Param("excludedParticipantStatuses") List<String> excludedParticipantStatuses,
            @Param("lowerBound") Instant lowerBound,
            @Param("upperBound") Instant upperBound,
            @Param("dateStrings") List<String> dateStrings,
            @Param("todayStr") String todayStr,
            @Param("nowInstant") Instant nowInstant,
            @Param("title") String title,
            @Param("hasLocationIds") boolean hasLocationIds,
            @Param("locationIds") List<Long> locationIds,
            @Param("feeType") String feeType,
            @Param("maxFeeAmountVnd") Long maxFeeAmountVnd,
            @Param("minOpenSlots") Integer minOpenSlots,
            @Param("startTimeBeforeOrEqual") Integer startTimeBeforeOrEqual,
            @Param("startTimeAfterOrEqual") Integer startTimeAfterOrEqual,
            @Param("zoneOffsetSeconds") Integer zoneOffsetSeconds,
            @Param("zoneId") String zoneId);
}

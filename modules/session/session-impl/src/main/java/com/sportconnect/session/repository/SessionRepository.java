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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, Long> {

    Page<Session> findByGroupId(Long groupId, Pageable pageable);

    boolean existsByGroupIdAndScheduledStart(Long groupId, LocalDateTime scheduledStart);

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
            @Param("now") LocalDateTime now,
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
            @Param("cutoff") LocalDateTime cutoff,
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
            @Param("cutoff") LocalDateTime cutoff,
            Pageable pageable);

    /**
     * SESSION-25 — joinable standalone sessions for discover: open (group_id IS NULL), status in
     * {@code statuses} (caller-narrowable subset of PREPARING/SCHEDULED/ONGOING), restricted to
     * {@code sportIds} (the caller's active-sport-profile gate, resolved by the caller), excluding
     * sessions the caller created and sessions the caller currently has a JOINED participant row
     * for (a session the caller left is eligible to reappear). Every parameter below {@code
     * sportIds} is an optional, AND-combined filter using the {@code (:param IS NULL OR ...)}
     * null-safe pattern ({@code GroupRepository.searchPublicGroupsWithCounts} precedent) — a null
     * value skips that condition entirely.
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
     * {@code SessionService.discoverSessions}'s Javadoc).
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
     * not fixed here (out of scope for this ticket).
     *
     * <p>An explicit {@code countQuery} is required (mirroring {@code
     * searchPublicGroupsWithCounts}) since Spring Data's automatic count-query derivation isn't
     * reliable for a multi-item {@code SELECT}.
     */
    @Query(
        value = "SELECT s, (s.capacity - s.initialSlot - "
                + "    (SELECT COUNT(sp2) FROM SessionParticipant sp2 "
                + "        WHERE sp2.sessionId = s.id AND sp2.status = :joinedStatus)) AS openSlots "
                + "FROM Session s WHERE s.groupId IS NULL AND s.status IN :statuses "
                + "AND s.sportId IN :sportIds AND s.createdBy <> :callerId "
                + "AND s.id NOT IN (SELECT sp.sessionId FROM SessionParticipant sp "
                + "    WHERE sp.userId = :callerId AND sp.status = :joinedStatus) "
                + "AND (CAST(:lowerBound AS timestamp) IS NULL OR s.scheduledStart >= :lowerBound) "
                + "AND (CAST(:title AS string) IS NULL OR LOWER(s.title) LIKE LOWER(CONCAT('%', CAST(:title AS string), '%'))) "
                + "AND (CAST(:locationId AS long) IS NULL OR s.locationId = :locationId) "
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
        countQuery = "SELECT COUNT(s) FROM Session s WHERE s.groupId IS NULL AND s.status IN :statuses "
                + "AND s.sportId IN :sportIds AND s.createdBy <> :callerId "
                + "AND s.id NOT IN (SELECT sp.sessionId FROM SessionParticipant sp "
                + "    WHERE sp.userId = :callerId AND sp.status = :joinedStatus) "
                + "AND (CAST(:lowerBound AS timestamp) IS NULL OR s.scheduledStart >= :lowerBound) "
                + "AND (CAST(:title AS string) IS NULL OR LOWER(s.title) LIKE LOWER(CONCAT('%', CAST(:title AS string), '%'))) "
                + "AND (CAST(:locationId AS long) IS NULL OR s.locationId = :locationId) "
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
            @Param("lowerBound") LocalDateTime lowerBound,
            @Param("title") String title,
            @Param("locationId") Long locationId,
            @Param("feeType") FeeType feeType,
            @Param("maxFeeAmountVnd") Long maxFeeAmountVnd,
            @Param("dayStart") LocalDateTime dayStart,
            @Param("dayEnd") LocalDateTime dayEnd,
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
     * in {@code participantStatuses} ({@code JOINED} or {@code INVITED}, never {@code REQUESTED}),
     * restricted to {@code statuses} ({@code PREPARING}/{@code SCHEDULED}/{@code ONGOING}).
     *
     * <p>{@code ORDER BY} is static and deliberately ignores whatever {@code Sort} the caller's
     * {@code Pageable} carries (the service passes an unsorted one) — {@code scheduledStart ASC}
     * primary, then a {@code PREPARING}→{@code SCHEDULED}→{@code ONGOING} tiebreaker for sessions
     * sharing the exact same {@code scheduledStart}, so pagination stays deterministic across that
     * tie instead of depending on Postgres's unspecified tie order.
     */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
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
            Pageable pageable);

    /** Same as {@link #findUpcomingSessions} narrowed to one calendar day
     * ({@code [dayStart, dayEnd)}, a half-open range rather than a date cast, so the existing
     * {@code (status, scheduled_start)} index still applies). */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd "
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
            @Param("dayStart") LocalDateTime dayStart,
            @Param("dayEnd") LocalDateTime dayEnd,
            Pageable pageable);

    /**
     * SESSION-27 — every session (standalone or group-linked) where the caller currently has a
     * {@code JOINED} participant row (not {@code INVITED} — an invite never accepted isn't "my
     * history"), restricted to {@code statuses} ({@code CANCELLED}/{@code COMPLETED}), narrowed to
     * one calendar day (same half-open range as {@link #findUpcomingSessionsByDate}). Sorted
     * {@code scheduledStart DESC}, static like {@link #findUpcomingSessions} — the service passes
     * an unsorted {@code Pageable}.
     */
    @Query("SELECT s FROM Session s WHERE s.status IN :statuses "
            + "AND s.scheduledStart >= :dayStart AND s.scheduledStart < :dayEnd "
            + "AND s.id IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :userId AND sp.status = :joinedStatus) "
            + "ORDER BY s.scheduledStart DESC")
    Page<Session> findHistorySessionsByDate(
            @Param("statuses") List<SessionStatus> statuses,
            @Param("userId") UUID userId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
            @Param("dayStart") LocalDateTime dayStart,
            @Param("dayEnd") LocalDateTime dayEnd,
            Pageable pageable);

    /**
     * SESSION-27 — the caller's last {@code limit} distinct calendar dates (most-recent-first) on
     * which they have at least one {@code CANCELLED}/{@code COMPLETED} session they were
     * {@code JOINED} to, each with its own count. {@code before} (nullable) restricts to dates
     * strictly earlier than it, for paging further back. Native — {@code GROUP BY} a date cast
     * with a {@code LIMIT} has no portable JPQL equivalent; same precedent as {@code
     * ProcessedMessageRepository.insertIfAbsent}, this module's Postgres-only tables. The service
     * requests {@code dateCount + 1} rows so it can compute {@code hasMore} and trim to
     * {@code dateCount}. {@code statuses}/{@code joinedStatus} are passed as enum {@code name()}
     * strings — a native query has no {@code @Enumerated} context to bind a Java enum directly.
     */
    @Query(value = "SELECT CAST(s.scheduled_start AS date) AS sessionDate, COUNT(*) AS count "
            + "FROM sessions s "
            + "WHERE s.status IN (:statuses) "
            + "AND s.id IN (SELECT sp.session_id FROM session_participants sp "
            + "    WHERE sp.user_id = :userId AND sp.status = :joinedStatus) "
            + "AND (CAST(:before AS date) IS NULL OR CAST(s.scheduled_start AS date) < CAST(:before AS date)) "
            + "GROUP BY CAST(s.scheduled_start AS date) "
            + "ORDER BY sessionDate DESC "
            + "LIMIT :limit",
            nativeQuery = true)
    List<SessionDateCountProjection> findHistoryDateCounts(
            @Param("statuses") List<String> statuses,
            @Param("userId") UUID userId,
            @Param("joinedStatus") String joinedStatus,
            @Param("before") LocalDate before,
            @Param("limit") int limit);

    interface SessionDateCountProjection {
        LocalDate getSessionDate();
        Long getCount();
    }
}

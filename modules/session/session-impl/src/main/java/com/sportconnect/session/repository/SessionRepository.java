package com.sportconnect.session.repository;

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
     * Joinable standalone sessions for discover: open (group_id IS NULL), in {@code status},
     * restricted to {@code sportIds} (the caller's active-sport-profile gate, resolved by the
     * caller), excluding sessions the caller created and sessions the caller currently has a
     * JOINED participant row for (a session the caller left is eligible to reappear).
     */
    @Query("SELECT s FROM Session s WHERE s.groupId IS NULL AND s.status = :status "
            + "AND s.sportId IN :sportIds AND s.createdBy <> :callerId "
            + "AND s.id NOT IN (SELECT sp.sessionId FROM SessionParticipant sp "
            + "    WHERE sp.userId = :callerId AND sp.status = :joinedStatus)")
    Page<Session> findDiscoverSessions(
            @Param("status") SessionStatus status,
            @Param("sportIds") List<Long> sportIds,
            @Param("callerId") UUID callerId,
            @Param("joinedStatus") ParticipantStatus joinedStatus,
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

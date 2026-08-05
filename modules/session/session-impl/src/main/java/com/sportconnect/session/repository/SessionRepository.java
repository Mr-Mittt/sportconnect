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

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, Long> {

    Page<Session> findByGroupId(Long groupId, Pageable pageable);

    Page<Session> findByCreatedByAndGroupIdIsNull(UUID createdBy, Pageable pageable);

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
}

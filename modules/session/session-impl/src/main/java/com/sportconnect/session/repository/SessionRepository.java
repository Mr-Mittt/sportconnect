package com.sportconnect.session.repository;

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
}

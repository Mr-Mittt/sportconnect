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
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, Long> {

    Page<Session> findByGroupId(Long groupId, Pageable pageable);

    Page<Session> findByCreatedByAndGroupIdIsNull(UUID createdBy, Pageable pageable);

    boolean existsByGroupIdAndScheduledStart(Long groupId, LocalDateTime scheduledStart);

    /** Batched via Pageable so an unbounded backlog can't be loaded in one query. */
    @Query("SELECT s FROM Session s WHERE s.status = :status "
            + "AND COALESCE(s.scheduledEndAt, s.scheduledStart) < :cutoff")
    Slice<Session> findPastScheduledSessions(
            @Param("status") SessionStatus status,
            @Param("cutoff") LocalDateTime cutoff,
            Pageable pageable);
}

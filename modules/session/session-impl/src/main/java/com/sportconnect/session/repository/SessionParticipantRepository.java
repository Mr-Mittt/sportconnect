package com.sportconnect.session.repository;

import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.entity.SessionParticipant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionParticipantRepository extends JpaRepository<SessionParticipant, Long> {

    Optional<SessionParticipant> findBySessionIdAndUserId(Long sessionId, UUID userId);

    /** Batch lookup for a page of sessions — one query for the caller's own row across all of
     * them, instead of a per-session findBySessionIdAndUserId call. */
    List<SessionParticipant> findBySessionIdInAndUserId(List<Long> sessionIds, UUID userId);

    Page<SessionParticipant> findBySessionIdAndStatus(Long sessionId, ParticipantStatus status, Pageable pageable);

    long countBySessionIdAndStatus(Long sessionId, ParticipantStatus status);

    /** Batch aggregate for a page of sessions — avoids one count query per row. */
    @Query("SELECT sp.sessionId as sessionId, COUNT(sp) as count FROM SessionParticipant sp "
            + "WHERE sp.sessionId IN :sessionIds AND sp.status = :status GROUP BY sp.sessionId")
    List<SessionParticipantCount> countBySessionIdsAndStatus(
            @Param("sessionIds") List<Long> sessionIds,
            @Param("status") ParticipantStatus status);

    interface SessionParticipantCount {
        Long getSessionId();
        Long getCount();
    }
}

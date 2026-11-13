package com.sportconnect.session.record;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SessionRecordRepository extends JpaRepository<SessionRecord, Long> {

    List<SessionRecord> findBySessionIdOrderByIdAsc(Long sessionId);

    long countBySessionId(Long sessionId);

    /** A retried add: the rows already stored for these client refs. */
    List<SessionRecord> findBySessionIdAndClientRequestIdIn(Long sessionId, Collection<UUID> clientRequestIds);

    /**
     * The rows a change set is about to update or delete, locked for the transaction. Ordered by id so
     * two overlapping change sets lock in the same order and cannot deadlock. A requested id that no
     * longer exists is simply absent from the result.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM SessionRecord r WHERE r.sessionId = :sessionId AND r.id IN :ids ORDER BY r.id")
    List<SessionRecord> findForUpdate(@Param("sessionId") Long sessionId, @Param("ids") Collection<Long> ids);
}

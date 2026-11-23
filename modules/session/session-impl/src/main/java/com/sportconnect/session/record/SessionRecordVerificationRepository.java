package com.sportconnect.session.record;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SessionRecordVerificationRepository
        extends JpaRepository<SessionRecordVerification, SessionRecordVerification.Key> {

    /** The confirmations of several records in one query (never one query per record). */
    List<SessionRecordVerification> findByRecordIdIn(Collection<Long> recordIds);

    Optional<SessionRecordVerification> findByRecordIdAndUserId(Long recordId, UUID userId);
}

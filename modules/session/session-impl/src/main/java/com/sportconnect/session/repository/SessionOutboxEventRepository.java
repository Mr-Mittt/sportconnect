package com.sportconnect.session.repository;

import com.sportconnect.common.outbox.OutboxEventStatus;
import com.sportconnect.session.entity.SessionOutboxEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionOutboxEventRepository extends JpaRepository<SessionOutboxEvent, Long> {

    /** Batch size caps how much a single relay tick drains — see {@code SessionOutboxRelayJob}. */
    List<SessionOutboxEvent> findTop50ByStatusOrderByCreatedAtAsc(OutboxEventStatus status);
}

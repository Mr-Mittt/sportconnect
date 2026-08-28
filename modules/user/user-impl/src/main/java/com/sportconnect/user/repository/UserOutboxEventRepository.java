package com.sportconnect.user.repository;

import com.sportconnect.common.outbox.OutboxEventStatus;
import com.sportconnect.user.entity.UserOutboxEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserOutboxEventRepository extends JpaRepository<UserOutboxEvent, Long> {

    /** Batch size caps how much a single relay tick drains — see {@code UserOutboxRelayJob}. */
    List<UserOutboxEvent> findTop50ByStatusOrderByCreatedAtAsc(OutboxEventStatus status);
}

package com.sportconnect.session.job;

import com.sportconnect.common.outbox.OutboxEventStatus;
import com.sportconnect.common.outbox.OutboxRelay;
import com.sportconnect.session.config.SessionOutboxRabbitConfig;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drains {@code session_outbox_events} and publishes to {@code sportconnect.events} (SESSION-15),
 * same shape as {@link SessionGenerationJob} — a {@code @Scheduled} job in this module owning its
 * own {@link OutboxRelay} instance, not a shared cross-domain component (see C3,
 * {@code modules/common/docs/BACKLOG_MVP.md}). 10s cadence — tighter than
 * {@code SessionGenerationJob}'s hourly/15-min jobs, since notification latency is user-visible in
 * a way session-lifecycle housekeeping isn't.
 */
@Component
@RequiredArgsConstructor
public class SessionOutboxRelayJob {

    private final SessionOutboxEventRepository sessionOutboxEventRepository;
    private final RabbitTemplate rabbitTemplate;

    @Scheduled(fixedDelay = 10000)
    public void drain() {
        new OutboxRelay<>(
                rabbitTemplate,
                SessionOutboxRabbitConfig.SPORTCONNECT_EVENTS_EXCHANGE,
                () -> sessionOutboxEventRepository.findTop50ByStatusOrderByCreatedAtAsc(OutboxEventStatus.PENDING),
                SessionOutboxEvent::getEventType,
                sessionOutboxEventRepository::save
        ).drain();
    }
}

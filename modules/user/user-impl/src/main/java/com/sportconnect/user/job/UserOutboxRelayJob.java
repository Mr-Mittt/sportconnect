package com.sportconnect.user.job;

import com.sportconnect.common.outbox.OutboxEventStatus;
import com.sportconnect.common.outbox.OutboxRelay;
import com.sportconnect.user.config.UserOutboxRabbitConfig;
import com.sportconnect.user.entity.UserOutboxEvent;
import com.sportconnect.user.repository.UserOutboxEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drains {@code user_outbox_events} and publishes to {@code sportconnect.events} (U13), same shape
 * as {@code session-impl}'s {@code SessionOutboxRelayJob} — a {@code @Scheduled} job owning its own
 * {@link OutboxRelay} instance per tick, not a shared cross-domain bean (see C3,
 * {@code modules/common/docs/BACKLOG_MVP.md}). 10s cadence: friend-request notification latency is
 * user-visible, so it matches the session relay rather than the slower housekeeping jobs.
 */
@Component
@RequiredArgsConstructor
public class UserOutboxRelayJob {

    private final UserOutboxEventRepository userOutboxEventRepository;
    private final RabbitTemplate rabbitTemplate;

    @Scheduled(fixedDelay = 10000)
    public void drain() {
        new OutboxRelay<>(
                rabbitTemplate,
                UserOutboxRabbitConfig.SPORTCONNECT_EVENTS_EXCHANGE,
                () -> userOutboxEventRepository.findTop50ByStatusOrderByCreatedAtAsc(OutboxEventStatus.PENDING),
                UserOutboxEvent::getEventType,
                userOutboxEventRepository::save
        ).drain();
    }
}

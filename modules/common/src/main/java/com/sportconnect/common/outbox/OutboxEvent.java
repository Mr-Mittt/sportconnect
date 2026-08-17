package com.sportconnect.common.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Durable record of an async event a domain write should trigger, written in the same
 * transaction as that write so the event's existence survives a crash between "the transaction
 * committed" and "the publish call was issued" — the gap a fire-and-forget publish (Spring
 * {@code ApplicationEventPublisher}, Redis pub/sub) can't close. See
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md} and this ticket's record
 * (C3, {@code modules/common/docs/BACKLOG_MVP.md}) for the full rationale.
 *
 * <p>Carries no table of its own — each domain extends this with its own concrete
 * {@code @Entity}/{@code @Table} (e.g. {@code PostOutboxEvent} → {@code post_outbox_events}),
 * staying inside that domain per the domain-scoped-tables rule. {@code eventType} doubles as the
 * routing key a domain's {@link OutboxRelay} instance publishes with (e.g.
 * {@code post.comment.created}).
 */
@MappedSuperclass
@Getter
@Setter
public abstract class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OutboxEventStatus status = OutboxEventStatus.PENDING;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    @Column(name = "last_attempt_at")
    private LocalDateTime lastAttemptAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;
}

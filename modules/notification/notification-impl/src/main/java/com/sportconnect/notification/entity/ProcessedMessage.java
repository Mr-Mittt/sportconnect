package com.sportconnect.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Idempotency marker for {@code SessionEventsConsumer} (NTF-2) — {@code messageId} is the AMQP
 * message id {@code common}'s {@code OutboxRelay} sets ({@code routingKey + ":" + outbox row id}),
 * globally unique across every producer. A row exists here for every message
 * {@code SessionEventProcessor} has committed the effects of; see
 * {@code ProcessedMessageRepository.insertIfAbsent} for how the actual dedup check is done (a
 * plain JPA {@code save()}/exception-catch approach doesn't work here — see that method's
 * Javadoc).
 */
@Entity
@Table(name = "processed_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedMessage {

    @Id
    @Column(name = "message_id")
    private String messageId;

    @CreationTimestamp
    @Column(name = "processed_at", nullable = false, updatable = false)
    private LocalDateTime processedAt;
}

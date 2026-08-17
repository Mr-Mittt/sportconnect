package com.sportconnect.common.outbox;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

/**
 * Reusable poll-publish-mark-sent logic for draining one domain's outbox table. Deliberately a
 * plain class, not a Spring bean — each domain constructs its own instance (typically from a
 * {@code @Scheduled} job in its own module, same shape as {@code session-impl}'s
 * {@code SessionGenerationJob}) and supplies its own repository access as plain functions, so
 * {@code common} never holds a reference to any domain's entity/repository type. See C3 in
 * {@code modules/common/docs/BACKLOG_MVP.md} for why this stops at the shape: the exchange name
 * is caller-supplied rather than hardcoded here — declaring/naming
 * {@code sportconnect.events} is explicitly out of scope for this ticket (NTF-2's job).
 *
 * @param <T> the domain's concrete {@link OutboxEvent} subclass
 */
@Slf4j
public class OutboxRelay<T extends OutboxEvent> {

    private static final long DEFAULT_CONFIRM_TIMEOUT_MS = 5000L;

    private final RabbitTemplate rabbitTemplate;
    private final String exchange;
    private final Supplier<List<T>> pendingFetcher;
    private final Function<T, String> routingKeyResolver;
    private final Consumer<T> saver;
    private final long confirmTimeoutMs;

    public OutboxRelay(RabbitTemplate rabbitTemplate, String exchange, Supplier<List<T>> pendingFetcher,
            Function<T, String> routingKeyResolver, Consumer<T> saver) {
        this(rabbitTemplate, exchange, pendingFetcher, routingKeyResolver, saver, DEFAULT_CONFIRM_TIMEOUT_MS);
    }

    public OutboxRelay(RabbitTemplate rabbitTemplate, String exchange, Supplier<List<T>> pendingFetcher,
            Function<T, String> routingKeyResolver, Consumer<T> saver, long confirmTimeoutMs) {
        this.rabbitTemplate = rabbitTemplate;
        this.exchange = exchange;
        this.pendingFetcher = pendingFetcher;
        this.routingKeyResolver = routingKeyResolver;
        this.saver = saver;
        this.confirmTimeoutMs = confirmTimeoutMs;
    }

    /**
     * Fetches candidate rows via the caller-supplied {@code pendingFetcher} and attempts to
     * publish each still-{@code PENDING} one (a defensive re-check — {@code SENT} rows the
     * fetcher over-returns are skipped, never re-published). A publish failure (nack or confirm
     * timeout) leaves the row {@code PENDING} with {@code attemptCount} bumped for the next call
     * to retry; it never throws out of this method.
     */
    public void drain() {
        for (T event : pendingFetcher.get()) {
            if (event.getStatus() != OutboxEventStatus.PENDING) {
                continue;
            }
            publish(event);
        }
    }

    private void publish(T event) {
        event.setAttemptCount(event.getAttemptCount() + 1);
        event.setLastAttemptAt(LocalDateTime.now());

        String routingKey = routingKeyResolver.apply(event);
        // Consumer-side dedup key (a redelivered message must be recognizable as "already seen"):
        // routingKey + this row's own id is unique across every current and future producer,
        // since routing keys are domain-prefixed by convention (e.g. "session.comment.created:42"
        // vs a hypothetical "post.comment.created:42" never collide).
        String messageId = routingKey + ":" + event.getId();
        try {
            rabbitTemplate.invoke(ops -> {
                ops.convertAndSend(exchange, routingKey, event.getPayload(),
                        message -> {
                            message.getMessageProperties().setMessageId(messageId);
                            return message;
                        });
                ops.waitForConfirmsOrDie(confirmTimeoutMs);
                return null;
            });
            event.setStatus(OutboxEventStatus.SENT);
            event.setSentAt(LocalDateTime.now());
        } catch (AmqpException ex) {
            log.warn("Outbox publish failed, leaving PENDING for retry: eventType={} attemptCount={}",
                    event.getEventType(), event.getAttemptCount(), ex);
        }
        saver.accept(event);
    }
}

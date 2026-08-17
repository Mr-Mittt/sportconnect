package com.sportconnect.common.outbox;

/**
 * Lifecycle of an {@link OutboxEvent} row. There is no terminal failure state — a row that fails
 * to publish simply stays {@code PENDING} for the next {@link OutboxRelay#drain()} to retry; see
 * {@code modules/common/docs/BACKLOG_MVP.md}'s C3 for why no backoff/dead-letter state was added.
 */
public enum OutboxEventStatus {
    PENDING,
    SENT
}

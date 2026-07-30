package com.sportconnect.session.api.dto;

/**
 * No {@code CANCELLED} status — manual cancellation wasn't requested and there's no
 * notification/cleanup flow to back it, so it's deliberately left out rather than half-built.
 */
public enum SessionStatus {
    SCHEDULED,
    COMPLETED
}

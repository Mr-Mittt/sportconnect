package com.sportconnect.session.api.dto;

/**
 * {@code SCHEDULED} → {@code ONGOING} → {@code COMPLETED} is driven automatically by
 * {@code SessionGenerationJob} based on {@code scheduledStart}/{@code scheduledEndAt} — a
 * session with no {@code scheduledEndAt} skips {@code ONGOING} entirely (goes straight to
 * {@code COMPLETED} once {@code scheduledStart} passes, since there's no known end to be
 * "ongoing" until). {@code CANCELLED} is the only status set by a user action
 * ({@code SessionService.cancelSession}), never by the job.
 */
public enum SessionStatus {
    SCHEDULED,
    ONGOING,
    COMPLETED,
    CANCELLED
}

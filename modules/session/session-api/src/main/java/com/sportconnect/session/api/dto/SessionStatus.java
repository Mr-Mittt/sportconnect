package com.sportconnect.session.api.dto;

/**
 * {@code PREPARING} → {@code SCHEDULED} → {@code ONGOING} → {@code COMPLETED} is the normal
 * lifecycle. {@code SCHEDULED} → {@code ONGOING} → {@code COMPLETED} is driven automatically by
 * {@code SessionGenerationJob} based on {@code scheduledStart}/{@code scheduledEndAt} — a
 * session with no {@code scheduledEndAt} skips {@code ONGOING} entirely (goes straight to
 * {@code COMPLETED} once {@code scheduledStart} passes, since there's no known end to be
 * "ongoing" until). {@code CANCELLED} is set by a user action ({@code SessionService
 * .cancelSession}) or, for a {@code PREPARING} session whose {@code scheduledStart} passes
 * without being completed, automatically by {@code SessionGenerationJob.cancelUnpreparedSessions}
 * (SESSION-24) — the only case where the job itself sets {@code CANCELLED}.
 *
 * <p>{@code PREPARING} (SESSION-24) — a session created with no {@code locationId} and/or no
 * {@code feeType} starts here instead of {@code SCHEDULED}. It is fully joinable, exactly like
 * {@code SCHEDULED}. The creator completes it via {@code SessionService.updateSession}, which is
 * the only path allowed to set {@code locationId}/{@code feeType} while the session is
 * {@code PREPARING} — once both are non-null, the session flips to {@code SCHEDULED}. If
 * {@code scheduledStart} passes while still {@code PREPARING}, the session is auto-cancelled.
 */
public enum SessionStatus {
    PREPARING,
    SCHEDULED,
    ONGOING,
    COMPLETED,
    CANCELLED
}

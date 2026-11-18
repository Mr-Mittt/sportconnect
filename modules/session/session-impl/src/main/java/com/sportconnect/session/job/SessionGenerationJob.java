package com.sportconnect.session.job;

import com.sportconnect.session.service.SessionGenerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cadence is intentionally coarse — closing past sessions is status-only cosmetics (nothing
 * downstream depends on sub-hour accuracy yet). No distributed lock — fine for the current
 * single-instance deployment; the unique (group_id, scheduled_start) key that was the idempotency
 * backstop was dropped by SESSION-GROUP-1 (SESSION-GROUP-5 adds a new one).
 *
 * <p><b>SESSION-38:</b> the hourly {@code generateUpcomingSessions()} sweep (re-scanning every
 * group with auto-generate enabled, regardless of whether its next occurrence already existed) is
 * removed — group session generation is now event-driven, triggered directly from
 * {@link SessionGenerationService#closePastSessions} (on completion) and
 * {@code SessionServiceImpl.generateNextOccurrenceForGroup} (on a recurrence/settings change),
 * never from a periodic job.
 */
@Component
@RequiredArgsConstructor
public class SessionGenerationJob {

    private final SessionGenerationService sessionGenerationService;

    @Scheduled(cron = "0 */15 * * * *") // every 15 minutes
    public void startOngoingSessions() {
        sessionGenerationService.startOngoingSessions();
    }

    @Scheduled(cron = "0 */15 * * * *") // every 15 minutes
    public void closePastSessions() {
        sessionGenerationService.closePastSessions();
    }

    @Scheduled(cron = "0 */15 * * * *") // every 15 minutes
    public void cancelUnpreparedSessions() {
        sessionGenerationService.cancelUnpreparedSessions();
    }
}

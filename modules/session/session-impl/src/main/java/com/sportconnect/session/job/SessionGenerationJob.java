package com.sportconnect.session.job;

import com.sportconnect.session.service.SessionGenerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cadence is intentionally coarse — recurrence is weekly-granularity, so generation only needs
 * to run often enough that the next occurrence always exists a comfortable margin before it
 * happens. Closing past sessions is status-only cosmetics (nothing downstream depends on
 * sub-hour accuracy yet). No distributed lock — fine for the current single-instance
 * deployment; {@code sessions.unique_group_session_start} is the idempotency backstop if this
 * ever runs on multiple instances.
 */
@Component
@RequiredArgsConstructor
public class SessionGenerationJob {

    private final SessionGenerationService sessionGenerationService;

    @Scheduled(cron = "0 0 * * * *") // top of every hour
    public void generateUpcomingSessions() {
        sessionGenerationService.generateUpcomingSessions();
    }

    @Scheduled(cron = "0 */15 * * * *") // every 15 minutes
    public void closePastSessions() {
        sessionGenerationService.closePastSessions();
    }
}

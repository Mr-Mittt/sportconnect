package com.sportconnect.session.job;

import com.sportconnect.session.service.SessionGenerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cadence is intentionally coarse — closing past sessions is status-only cosmetics (nothing
 * downstream depends on sub-hour accuracy yet). No distributed lock — fine for the current
 * single-instance deployment.
 *
 * <p><b>SESSION-GROUP-5:</b> no job generates sessions. Regular group sessions are generated from a queue
 * ({@code GroupSessionGenerationPlanner}, {@code GroupSessionGenerationRunner}) fed by the startup recovery, by a regular
 * session ending ({@code SessionGenerationService.closePastSessions}, {@code cancelSession}) and by a configuration change;
 * its duplicate guard is the unique {@code (recurrence_id, occurrence_date)} index on {@code sessions}. (SESSION-38's
 * event-driven single-rule generation, and SESSION-2's hourly sweep before it, are gone.)
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

package com.sportconnect.session.job;

import com.sportconnect.session.stats.SessionStatsWorker;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * SESSION-53: the statistics engine's clock. Every 5 minutes (after a 1-minute initial delay, no separate start-up run) it
 * nudges {@link SessionStatsWorker}, which counts the completed sessions whose 24-hour guard has passed and retries the
 * failed ones that are due. Only a nudge: the scheduler thread, shared with every other {@code @Scheduled} job, never does
 * the counting. Switched off in tests ({@code app.stats.job.enabled=false}) so a tick cannot touch a job row a test holds.
 * Listed in {@code documentation/md/BACKGROUND_JOBS.md}.
 */
@Component
@ConditionalOnProperty(name = "app.stats.job.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class SessionStatsDrainJob {

    private final SessionStatsWorker worker;

    @Scheduled(fixedDelayString = "${app.stats.job.interval-ms:300000}",
            initialDelayString = "${app.stats.job.initial-delay-ms:60000}")
    public void tick() {
        worker.nudge();
    }
}

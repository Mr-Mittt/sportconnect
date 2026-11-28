package com.sportconnect.session.job;

import com.sportconnect.session.season.GroupSeasonWorker;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * SESSION-55: the seasons' clock. Every 5 minutes (after a 1-minute initial delay, no separate start-up run) it nudges
 * {@link GroupSeasonWorker}, which starts the seasons whose start date has come, completes those whose end date is over, and (slice 2)
 * finalises those past their guard. Only a nudge: the scheduler thread, shared with every other {@code @Scheduled} job, never advances a
 * season. It is also the retry's clock: a season that failed is tried again at the next tick. Switched off in tests
 * ({@code app.session.season.enabled=false}). Listed in {@code documentation/md/BACKGROUND_JOBS.md}.
 */
@Component
@ConditionalOnProperty(name = "app.session.season.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class GroupSeasonJob {

    private final GroupSeasonWorker worker;

    @Scheduled(fixedDelayString = "${app.session.season.interval-ms:300000}",
            initialDelayString = "${app.session.season.initial-delay-ms:60000}")
    public void tick() {
        worker.nudge();
    }
}

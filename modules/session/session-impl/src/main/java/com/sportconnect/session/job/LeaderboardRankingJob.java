package com.sportconnect.session.job;

import com.sportconnect.session.ranking.LeaderboardRanker;
import com.sportconnect.session.ranking.LeaderboardRankingWorker;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * SESSION-54: the leaderboards' clocks. The nightly tick ({@code app.stats.ranking.cron}, default 00:05
 * {@code Asia/Ho_Chi_Minh}) nudges {@link LeaderboardRankingWorker} to rank every dirty board; a retry tick (every
 * {@code app.stats.ranking.retry-interval-ms}, default 30 minutes) nudges it for the boards whose last run failed and whose
 * retry time has come. Only nudges: the scheduler thread, shared with every other {@code @Scheduled} job, never ranks. Switched off
 * in tests ({@code app.stats.ranking.enabled=false}). Listed in {@code documentation/md/BACKGROUND_JOBS.md}.
 */
@Component
@ConditionalOnProperty(name = "app.stats.ranking.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class LeaderboardRankingJob {

    private final LeaderboardRankingWorker worker;

    @Scheduled(cron = "${app.stats.ranking.cron:0 5 0 * * *}", zone = "${app.stats.ranking.zone:Asia/Ho_Chi_Minh}")
    public void nightly() {
        worker.nudge(LeaderboardRanker.Mode.NIGHTLY);
    }

    @Scheduled(fixedDelayString = "${app.stats.ranking.retry-interval-ms:1800000}",
            initialDelayString = "${app.stats.ranking.retry-initial-delay-ms:300000}")
    public void retry() {
        worker.nudge(LeaderboardRanker.Mode.RETRY);
    }
}

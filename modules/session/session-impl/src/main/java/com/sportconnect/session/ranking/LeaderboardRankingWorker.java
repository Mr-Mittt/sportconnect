package com.sportconnect.session.ranking;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * SESSION-54: the asynchronous runner of the ranking pass: <b>one worker thread per instance</b>, so the shared scheduler thread
 * (every {@code @Scheduled} method of the server runs on one) never ranks a board. The nightly cron and the retry tick
 * ({@link com.sportconnect.session.job.LeaderboardRankingJob}) only {@link #nudge nudge} it. Same shape as
 * {@link com.sportconnect.session.stats.SessionStatsWorker}: a queue of one with a discard policy, so a nudge while a pass runs
 * and another is queued is dropped (the pass takes everything that is runnable); not an {@code Executor} bean. With
 * {@code app.stats.ranking.async=false} (the test profile) {@link #nudge} runs the pass on the calling thread.
 *
 * <p>A nightly nudge that arrives while a retry pass is queued is dropped with it; the pass the queue holds is run as the mode
 * of the first nudge, so the worker remembers the widest mode asked for ({@code NIGHTLY} beats {@code RETRY}).
 */
@Slf4j
@Component
public class LeaderboardRankingWorker {

    private final LeaderboardRanker ranker;
    private final ThreadPoolExecutor executor;
    private volatile LeaderboardRanker.Mode requested = LeaderboardRanker.Mode.RETRY;

    public LeaderboardRankingWorker(LeaderboardRanker ranker, @Value("${app.stats.ranking.async:true}") boolean async) {
        this.ranker = ranker;
        this.executor = async
                ? new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1),
                        task -> {
                            Thread thread = new Thread(task, "leaderboard-ranking");
                            thread.setDaemon(true);
                            return thread;
                        },
                        (task, pool) -> log.debug("Ranking nudge coalesced: a pass is already running and one is queued"))
                : null;
    }

    /** Asks the worker to run a pass; returns at once (unless synchronous). Never throws. */
    public void nudge(LeaderboardRanker.Mode mode) {
        if (mode == LeaderboardRanker.Mode.NIGHTLY) {
            requested = LeaderboardRanker.Mode.NIGHTLY;
        }
        if (executor == null) {
            pass();
            return;
        }
        executor.execute(this::pass);
    }

    private void pass() {
        LeaderboardRanker.Mode mode = requested;
        requested = LeaderboardRanker.Mode.RETRY;
        try {
            ranker.run(mode);
        } catch (Exception e) {
            log.error("Ranking pass failed", e);
        }
    }

    @PreDestroy
    public void shutdown() throws InterruptedException {
        if (executor != null) {
            executor.shutdown();
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                log.warn("Ranking worker did not finish within 30 seconds of shutdown");
            }
        }
    }
}

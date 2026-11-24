package com.sportconnect.session.stats;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * SESSION-53: the asynchronous runner of the statistics queue: <b>one worker thread per instance</b> that drains it, so the
 * shared scheduler thread (every {@code @Scheduled} method of the server runs on one) never counts games. The 5-minute tick
 * ({@link com.sportconnect.session.job.SessionStatsDrainJob}) only {@link #nudge()}s it. The executor has one thread and a queue of one with a discard
 * policy: a nudge while a drain runs and another is already queued is dropped, which is safe because the runner loops until
 * nothing is due. Instances share the queue through the claims ({@link SessionStatsRunner}).
 *
 * <p>Deliberately not an {@code Executor} bean (it would switch off Boot's {@code applicationTaskExecutor}, used by the
 * {@code @Async} email sender), the same choice as {@code GroupSessionGenerationWorker}. With
 * {@code app.stats.job.async=false} (the test profile) {@link #nudge()} drains on the calling thread.
 */
@Slf4j
@Component
public class SessionStatsWorker {

    private final SessionStatsRunner runner;
    private final ThreadPoolExecutor executor;

    public SessionStatsWorker(SessionStatsRunner runner, @Value("${app.stats.job.async:true}") boolean async) {
        this.runner = runner;
        this.executor = async
                ? new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1),
                        task -> {
                            Thread thread = new Thread(task, "session-stats");
                            thread.setDaemon(true);
                            return thread;
                        },
                        (task, pool) -> log.debug("Statistics nudge coalesced: a drain is already running and one is queued"))
                : null;
    }

    /** Asks the worker to drain the queue; returns at once (unless synchronous). Never throws. */
    public void nudge() {
        if (executor == null) {
            drain();
            return;
        }
        executor.execute(this::drain);
    }

    private void drain() {
        try {
            int attempted = runner.processDue();
            if (attempted > 0) {
                log.info("Statistics drained the queue: {} session(s) attempted", attempted);
            }
        } catch (Exception e) {
            log.error("Statistics drain failed", e);
        }
    }

    @PreDestroy
    public void shutdown() throws InterruptedException {
        if (executor != null) {
            executor.shutdown();
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                log.warn("Statistics worker did not finish within 30 seconds of shutdown");
            }
        }
    }
}

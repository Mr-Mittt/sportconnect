package com.sportconnect.session.season;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * SESSION-55: the asynchronous runner of the season status pass: <b>one worker thread per instance</b>, so the shared scheduler thread
 * (every {@code @Scheduled} method of the server runs on one) never advances a season. {@code GroupSeasonJob} only nudges it. Same shape
 * as {@code LeaderboardRankingWorker}: a queue of one with a discard policy, so a nudge while a pass runs and another is queued is dropped
 * (a pass takes every season that is due); deliberately not an {@code Executor} bean. With {@code app.session.season.async=false} (the test
 * profile) {@link #nudge} runs the pass on the calling thread.
 */
@Slf4j
@Component
public class GroupSeasonWorker {

    private final SeasonTransitions transitions;
    private final ThreadPoolExecutor executor;

    public GroupSeasonWorker(SeasonTransitions transitions, @Value("${app.session.season.async:true}") boolean async) {
        this.transitions = transitions;
        this.executor = async
                ? new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1),
                        task -> {
                            Thread thread = new Thread(task, "group-season");
                            thread.setDaemon(true);
                            return thread;
                        },
                        (task, pool) -> log.debug("Season nudge coalesced: a pass is already running and one is queued"))
                : null;
    }

    /** Asks the worker to run a pass; returns at once (unless synchronous). Never throws. */
    public void nudge() {
        if (executor == null) {
            pass();
            return;
        }
        executor.execute(this::pass);
    }

    private void pass() {
        try {
            transitions.tick();
        } catch (Exception e) {
            log.error("Season pass failed", e);
        }
    }

    @PreDestroy
    public void shutdown() throws InterruptedException {
        if (executor != null) {
            executor.shutdown();
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                log.warn("Season worker did not finish within 30 seconds of shutdown");
            }
        }
    }
}

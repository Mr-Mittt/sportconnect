package com.sportconnect.session.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * SESSION-GROUP-5 review (owner, 2026-11-19) — the asynchronous runner: <b>one worker thread per instance</b> that drains the
 * generation queue, so a save, a cancel or a restart never waits for generation.
 *
 * <p>The triggers ({@link GroupSessionGenerationListener}) plan inline (a few idempotent queries) and then {@link #nudge()} this
 * worker, as does the 60-second safety net ({@code GroupSessionGenerationDrainJob}, which also gives the retry backoff its
 * clock). The executor has one thread and a queue of one with a discard policy: a nudge while a drain is running and another is
 * already queued is dropped, which is safe because the queued drain starts after that nudge's planning has committed, so it sees
 * what that nudge queued; the runner itself loops until nothing is due. At most one runner per instance, so the database
 * connections it holds are bounded; instances share the queue through the row lock ({@code FOR UPDATE SKIP LOCKED}). Scaling it
 * with the backlog, up to a limit, is SESSION-GROUP-9.
 *
 * <p>This is deliberately not an {@code Executor} bean: defining one would switch off Spring Boot's own
 * {@code applicationTaskExecutor}, which the {@code @Async} email sender uses. With
 * {@code app.session.generation.async=false} (the test profile) {@link #nudge()} drains on the calling thread instead.
 * Nudges lost at shutdown cost nothing: the queue is persisted and the startup recovery plans and drains again.
 */
@Slf4j
@Component
public class GroupSessionGenerationWorker {

    private final GroupSessionGenerationRunner runner;
    private final ThreadPoolExecutor executor;

    public GroupSessionGenerationWorker(GroupSessionGenerationRunner runner,
                                        @Value("${app.session.generation.async:true}") boolean async) {
        this.runner = runner;
        this.executor = async
                ? new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1),
                        task -> {
                            Thread thread = new Thread(task, "group-session-generation");
                            thread.setDaemon(true);
                            return thread;
                        },
                        (task, pool) -> log.debug("Generation nudge coalesced: a drain is already running and one is queued"))
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
                log.info("Group session generation drained the queue: {} slot(s) attempted", attempted);
            }
        } catch (Exception e) {
            log.error("Group session generation drain failed", e);
        }
    }

    @PreDestroy
    public void shutdown() throws InterruptedException {
        if (executor != null) {
            executor.shutdown();
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                log.warn("Group session generation worker did not finish within 30 seconds of shutdown");
            }
        }
    }
}

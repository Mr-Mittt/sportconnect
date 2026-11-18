package com.sportconnect.session.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * SESSION-GROUP-5 — the producers of the generation queue: the startup recovery, a regular session ending, and a configuration
 * change. Each asks the {@link GroupSessionGenerationPlanner} what to queue, then {@link GroupSessionGenerationRunner} to
 * generate it. The two transactional ones run only after the changing transaction commits (and also when there was none,
 * {@code fallbackExecution}), and every body is caught and logged: a failure here must never undo or fail the change that
 * caused it; the next trigger, or the startup recovery, queues the slot again.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GroupSessionGenerationListener {

    private final GroupSessionGenerationPlanner planner;
    private final GroupSessionGenerationRunner runner;

    /** Down-time recovery: a group whose next slot passed while the server was down gets it (if still running) or the next one. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            int queued = planner.enqueueForAllEnabledGroups();
            int attempted = runner.processDue();
            log.info("Group session generation at startup: {} slot(s) queued, {} attempted", queued, attempted);
        } catch (Exception e) {
            log.error("Group session generation at startup failed", e);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onRegularSessionsEnded(GroupSessionGenerationEvents.RegularSessionsEnded event) {
        try {
            planner.enqueueAfterDaysEnded(event.days());
            runner.processDue();
        } catch (Exception e) {
            log.warn("Group session generation after regular sessions ended failed for {}", event.days(), e);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onConfigChanged(GroupSessionGenerationEvents.ConfigChanged event) {
        try {
            planner.enqueueAfterConfigurationChange(event.groupId());
            runner.processDue();
        } catch (Exception e) {
            log.warn("Group session generation after a configuration change failed for group {}", event.groupId(), e);
        }
    }
}

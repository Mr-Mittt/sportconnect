package com.sportconnect.session.job;

import com.sportconnect.session.service.GroupSessionGenerationWorker;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * SESSION-GROUP-5 review — the generation queue's safety net and its clock: every 60 seconds it nudges the worker, so a slot whose
 * retry backoff (1, 5, 15, 60 minutes) has run out is tried again at about that time, not at the next unrelated trigger, and a slot
 * queued by an instance that died before it could drain is picked up. Only a nudge: the scheduler thread (shared with the other
 * scheduled jobs) never does the generation itself. Switched off in tests ({@code app.session.generation.safety-net=false}) so a
 * tick cannot touch a queue row a test is holding.
 */
@Component
@ConditionalOnProperty(name = "app.session.generation.safety-net", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class GroupSessionGenerationDrainJob {

    private final GroupSessionGenerationWorker worker;

    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void drain() {
        worker.nudge();
    }
}

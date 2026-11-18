package com.sportconnect.session.service;

import com.sportconnect.session.entity.GroupSessionGenerationItem;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * SESSION-GROUP-5 — drains the generation queue: the due {@code PENDING} slots, soonest first, one slot per transaction
 * ({@link GroupSessionOccurrenceGenerator}). Not transactional itself. A slot that fails is recorded (backoff, then
 * {@code FAILED}) and is not tried again in the same run, so a failing slot can neither stop the others nor loop.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GroupSessionGenerationRunner {

    private static final int BATCH_SIZE = 50;

    private final GroupSessionGenerationQueueRepository queueRepository;
    private final GroupSessionOccurrenceGenerator generator;

    /** Replaceable in tests; not a constructor dependency. */
    Clock clock = Clock.systemUTC();

    /** @return how many slots were attempted */
    public int processDue() {
        Set<Long> attempted = new HashSet<>();
        for (;;) {
            List<GroupSessionGenerationItem> due = queueRepository.findDue(clock.instant(), PageRequest.of(0, BATCH_SIZE)).stream()
                    .filter(item -> !attempted.contains(item.getId()))
                    .toList();
            if (due.isEmpty()) {
                return attempted.size();
            }
            for (GroupSessionGenerationItem item : due) {
                attempted.add(item.getId());
                try {
                    generator.generate(item.getId());
                } catch (Exception e) {
                    try {
                        generator.recordFailure(item.getId(), e.getClass().getSimpleName() + ": " + e.getMessage());
                    } catch (Exception recording) {
                        log.error("Could not record the failure of queue item {}", item.getId(), recording);
                    }
                }
            }
        }
    }
}

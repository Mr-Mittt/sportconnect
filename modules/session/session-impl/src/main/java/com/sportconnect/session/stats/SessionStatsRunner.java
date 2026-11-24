package com.sportconnect.session.stats;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * SESSION-53: drains the statistics queue. Not transactional itself: it picks the sessions that are due, claims each one in
 * a small transaction of its own ({@link SessionStatsWriter}), counts it in {@link SessionStatsProcessor}'s transaction, and
 * records a failure separately, so one bad session never undoes another.
 *
 * <p><b>What is due.</b> Job rows that are due again ({@code RETRY} or {@code FAILED} whose time has come, a {@code RUNNING}
 * claim older than the stale limit), then completed sessions with no job row whose 24-hour guard has passed, oldest guard
 * first. A pass takes at most {@code batch-size} sessions; the drain repeats passes until nothing is due or the time budget
 * is spent (the next tick carries on), so a backlog drains without ever running unbounded.
 *
 * <p><b>Two at once.</b> A session with no row is claimed by inserting one (the primary key makes the loser fail, and the
 * loser skips); a due row is claimed by a compare-and-set update (the loser gets 0 and skips); and the processor takes the
 * job row's lock and checks it still owns the claim, so a worker whose claim was taken over after the stale limit changes
 * nothing. A session that fails is not picked again in the same drain: its row is {@code RETRY} with a time ahead.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionStatsRunner {

    private final SessionStatsJobRepository jobRepository;
    private final SessionStatsWriter writer;
    private final SessionStatsProcessor processor;

    @Value("${app.stats.job.batch-size:50}")
    private int batchSize = 50;

    @Value("${app.stats.job.guard-hours:24}")
    private long guardHours = 24;

    @Value("${app.stats.job.stale-minutes:10}")
    private long staleMinutes = 10;

    @Value("${app.stats.job.budget-minutes:10}")
    private long budgetMinutes = 10;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /**
     * Counts everything that is due now.
     *
     * @return how many sessions this call attempted (claimed and ran), counting a failed attempt
     */
    public int processDue() {
        Instant deadline = clock.instant().plus(Duration.ofMinutes(budgetMinutes));
        int total = 0;
        while (true) {
            int attempted = pass(batchSize);
            total += attempted;
            if (attempted == 0 || !clock.instant().isBefore(deadline)) {
                return total;
            }
        }
    }

    /** One pass: due job rows first, then new sessions, at most {@code limit} together. */
    int pass(int limit) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        Instant staleBefore = now.minus(Duration.ofMinutes(staleMinutes));
        int attempted = 0;
        List<Long> due = jobRepository.findDueSessionIds(now, staleBefore, PageRequest.of(0, limit));
        for (Long id : due) {
            Instant claimedAt = clock.instant().truncatedTo(ChronoUnit.MILLIS);
            if (writer.claimDue(id, claimedAt, staleBefore)) {
                run(id, claimedAt);
                attempted++;
            }
        }
        int room = limit - due.size();
        if (room > 0) {
            Instant cutoff = now.minus(Duration.ofHours(guardHours));
            for (Long id : jobRepository.findNewSessionIds(cutoff, PageRequest.of(0, room))) {
                Instant claimedAt = clock.instant().truncatedTo(ChronoUnit.MILLIS);
                try {
                    writer.insertClaim(id, claimedAt);
                } catch (DataIntegrityViolationException e) {
                    log.info("Statistics claim race absorbed: session {}", id);
                    continue;
                }
                run(id, claimedAt);
                attempted++;
            }
        }
        return attempted;
    }

    private void run(Long sessionId, Instant claimedAt) {
        try {
            processor.process(sessionId, claimedAt);
        } catch (SessionStatsProcessor.ClaimLostException e) {
            log.info("Statistics for session {} not counted by this attempt: {}", sessionId, e.getMessage());
        } catch (RuntimeException e) {
            log.warn("Statistics for session {} failed, it will be retried", sessionId, e);
            try {
                writer.recordFailure(sessionId, claimedAt, e.getClass().getSimpleName() + ": " + e.getMessage(),
                        clock.instant());
            } catch (RuntimeException recordingFailed) {
                log.error("Could not record the statistics failure of session {}; the claim goes stale and is taken over",
                        sessionId, recordingFailed);
            }
        }
    }
}

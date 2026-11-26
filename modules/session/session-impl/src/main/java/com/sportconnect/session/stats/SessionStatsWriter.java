package com.sportconnect.session.stats;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * SESSION-53: the statistics engine's small writes, each its own {@code REQUIRES_NEW} transaction, for the same reason
 * {@code GroupSessionQueueWriter} is one: the caller is either not transactional (the runner) or already inside the
 * session's counting transaction, and a unique-key violation from a concurrent worker must roll back only this tiny
 * transaction. The caller catches {@link org.springframework.dao.DataIntegrityViolationException} outside it and carries on.
 */
@Service
@RequiredArgsConstructor
public class SessionStatsWriter {

    private final SessionStatsJobRepository jobRepository;
    private final UserSportStatsRepository userStatsRepository;
    private final GroupMemberStatsRepository groupMemberStatsRepository;
    private final GroupStatsRepository groupStatsRepository;
    private final StatBoardRunRepository boardRunRepository;

    @Value("${app.stats.job.max-attempts:4}")
    private int maxAttempts = 4;

    @Value("${app.stats.job.retry-minutes:15}")
    private long retryMinutes = 15;

    @Value("${app.stats.job.failed-wait-hours:6}")
    private long failedWaitHours = 6;

    /**
     * Claims a session that has no job row by inserting one {@code RUNNING}. Throws
     * {@link org.springframework.dao.DataIntegrityViolationException} when another worker inserted it first.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insertClaim(Long sessionId, Instant now) {
        jobRepository.insertClaim(sessionId, now);
    }

    /** @return true if this call took the due row (compare-and-set), false if it is not due any more or another worker has it */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claimDue(Long sessionId, Instant now, Instant staleBefore) {
        return jobRepository.claimDue(sessionId, now, staleBefore) == 1;
    }

    /**
     * Records a failed attempt: {@code RETRY} due {@code retryMinutes} from now, or {@code FAILED} once {@code maxAttempts}
     * are used (due again after {@code failedWaitHours}, one attempt each time). Changes nothing if this attempt no longer
     * owns the row.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long sessionId, Instant claimedAt, String error, Instant now) {
        SessionStatsJob job = jobRepository.findById(sessionId).orElse(null);
        if (job == null) {
            return;
        }
        boolean exhausted = job.getAttempts() >= maxAttempts;
        SessionStatsJob.Status status = exhausted ? SessionStatsJob.Status.FAILED : SessionStatsJob.Status.RETRY;
        Instant next = now.plus(exhausted ? Duration.ofHours(failedWaitHours) : Duration.ofMinutes(retryMinutes));
        String message = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        jobRepository.recordFailure(sessionId, claimedAt, status, next, message, now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureUserRow(UUID userId, Long sportId) {
        if (!userStatsRepository.existsById(new UserSportStats.Key(userId, sportId))) {
            userStatsRepository.saveAndFlush(new UserSportStats(userId, sportId));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureGroupRow(Long groupId, UUID userId, Long sportId) {
        if (!groupMemberStatsRepository.existsById(new GroupMemberStats.Key(groupId, userId, sportId))) {
            groupMemberStatsRepository.saveAndFlush(new GroupMemberStats(groupId, userId, sportId));
        }
    }

    /** Creates the group's head-to-head row ({@link GroupStats}) when it has none; the caller locks it afterwards. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureGroupStatsRow(Long groupId, Long sportId) {
        if (!groupStatsRepository.existsById(new GroupStats.Key(groupId, sportId))) {
            groupStatsRepository.saveAndFlush(new GroupStats(groupId, sportId));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureBoardRun(Long sportId, String scopeType, Long scopeId, Long countryId) {
        if (!boardRunRepository.existsById(new StatBoardRun.Key(sportId, scopeType, scopeId))) {
            boardRunRepository.saveAndFlush(new StatBoardRun(sportId, scopeType, scopeId, countryId));
        }
    }
}

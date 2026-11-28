package com.sportconnect.session.season;

import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.social.post.api.dto.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/**
 * SESSION-55: advances ONE season as far as the calendar allows, in a transaction of its own (a failure leaves every other season alone and
 * is retried by the next tick). A separate bean from {@link SeasonTransitions} so the call goes through the Spring proxy.
 *
 * <p><b>Guard:</b> the season's row is taken with {@code FOR UPDATE SKIP LOCKED}, the lock an owner's edit, cancel or link change also
 * takes, so a season someone else holds right now is skipped (this tick or the next does it) and an edit and a transition never interleave.
 * The status is re-read under the lock and every move is made from it, so a season cancelled a moment ago is not started.
 */
@Slf4j
@Component
@RequiredArgsConstructor
class SeasonTransitionStep {

    private final GroupSeasonRepository seasonRepository;
    private final SeasonAnnouncer announcer;
    private final SeasonFinaliser finaliser;
    private final SeasonRowLock rowLock;

    /** The window after a season's end in which players can still log and confirm games: the job finalises only after it (the owner may finalise at once). */
    @Value("${app.stats.job.guard-hours:24}")
    private long guardHours;

    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /**
     * SCHEDULED to ONGOING once the clock reaches the start instant (the "started" announcement), ONGOING to COMPLETED once the end instant
     * has passed. A job that was down for days may take both steps in one go. COMPLETED to FINALISED once the guard after the end has passed (the sweep and the finalise: {@link SeasonFinaliser}).
     *
     * @return {@code true} if the season changed status
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean advance(Long seasonId) {
        GroupSeason season = rowLock.lockOrSkip(seasonId).orElse(null);
        if (season == null) {
            return false;
        }
        Instant now = clock.instant();
        boolean changed = false;
        if (season.getStatus() == SeasonStatus.SCHEDULED && !now.isBefore(season.getStartAt())) {
            season.setStatus(SeasonStatus.ONGOING);
            announcer.announce(season, SystemCode.GROUP_SEASON_STARTED, null);
            log.info("Season {} of group {} started", season.getId(), season.getGroupId());
            changed = true;
        }
        if (season.getStatus() == SeasonStatus.ONGOING && !now.isBefore(season.getEndAt())) {
            season.setStatus(SeasonStatus.COMPLETED);
            log.info("Season {} of group {} completed", season.getId(), season.getGroupId());
            changed = true;
        }
        if (season.getStatus() == SeasonStatus.COMPLETED && !now.isBefore(SeasonDates.finalisesAt(season.getEndAt(), guardHours))) {
            // the guard has passed: sweep the sessions the engine has not counted, then freeze the season
            changed |= finaliser.finalise(season, now, null);
        }
        if (changed || season.getLastError() != null) {
            season.setLastError(null);
            season.setUpdatedAt(now);
            seasonRepository.save(season);
        }
        return changed;
    }

    /** Writes what a failed transition last died of, for an operator; its own transaction, so it survives the failed one's rollback. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordError(Long seasonId, String error) {
        String message = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        seasonRepository.recordError(seasonId, message);
    }
}

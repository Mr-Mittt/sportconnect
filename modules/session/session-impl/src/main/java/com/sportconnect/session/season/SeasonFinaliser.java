package com.sportconnect.session.season;

import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.stats.SeasonStatsCounter;
import com.sportconnect.social.post.api.dto.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * SESSION-55 slice 2: finalises a {@code COMPLETED} season, by the status job after the guard or by an owner or admin at once. Finalising first
 * <b>sweeps</b> the sessions the engine has not counted yet (the last day's, still inside their 24-hour guard): every {@code COMPLETED}
 * session the season wants (AUTO: the group's sessions inside its range; MANUAL: the linked ones) that its ledger does not hold is counted
 * straight into the season, from its records as they are now, <b>without touching {@code session_stats_jobs}</b> (the players' own rows,
 * the group's rows and the other boards still count that session through the normal job). Then the season is {@code FINALISED} for good and the
 * group is told.
 *
 * <p>The caller holds the season's row lock ({@code FOR UPDATE}, or {@code SKIP LOCKED} for the job) and passes the locked season; the status is
 * re-checked here, so a season finalised a moment ago by the other path is left alone and the second caller does nothing twice. Idempotent by the
 * ledger: a session a season counted is never counted again.
 */
@Slf4j
@Component
@RequiredArgsConstructor
class SeasonFinaliser {

    private final SessionRepository sessionRepository;
    private final GroupSeasonSessionRepository linkRepository;
    private final GroupSeasonRepository seasonRepository;
    private final SeasonStatsCounter counter;
    private final SeasonAnnouncer announcer;

    /**
     * @param by the name of whoever finalised it, or {@code null} for the status job
     * @return {@code true} when this call finalised the season, {@code false} when it was not {@code COMPLETED} any more
     */
    boolean finalise(GroupSeason season, Instant now, String by) {
        if (season.getStatus() != SeasonStatus.COMPLETED) {
            return false;
        }
        int swept = 0;
        for (Session session : sessionsToSweep(season)) {
            if (counter.countInto(season, session)) {
                swept++;
            }
        }
        season.setStatus(SeasonStatus.FINALISED);
        season.setFinalisedAt(now);
        season.setUpdatedAt(now);
        season.setLastError(null);
        seasonRepository.save(season);
        announcer.announce(season, SystemCode.GROUP_SEASON_FINALISED, by);
        log.info("Season {} of group {} finalised ({} session(s) swept in)", season.getId(), season.getGroupId(), swept);
        return true;
    }

    /** The completed sessions the season wants, oldest first; the counter skips those its ledger already holds. */
    private List<Session> sessionsToSweep(GroupSeason season) {
        List<Session> sessions = season.getCollectionMode() == SeasonCollectionMode.AUTO
                ? sessionRepository.findByGroupIdAndStatusAndScheduledStartGreaterThanEqualAndScheduledStartLessThan(
                        season.getGroupId(), SessionStatus.COMPLETED, season.getStartAt(), season.getEndAt())
                : sessionRepository.findAllById(linkRepository.findBySeasonId(season.getId()).stream()
                        .map(GroupSeasonSession::getSessionId).toList()).stream()
                        .filter(session -> session.getStatus() == SessionStatus.COMPLETED
                                && SeasonDates.contains(season.getStartAt(), season.getEndAt(), session.getScheduledStart()))
                        .toList();
        return sessions.stream().sorted(Comparator.comparing(Session::getScheduledStart).thenComparing(Session::getId)).toList();
    }
}

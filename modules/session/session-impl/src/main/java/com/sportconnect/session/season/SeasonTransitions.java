package com.sportconnect.session.season;

import com.sportconnect.session.api.dto.SeasonStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.List;

/**
 * SESSION-55: one pass of the status job over every season that can still change (SCHEDULED, ONGOING, COMPLETED: two open per group plus
 * the ones waiting to finalise, so a small, bounded set). Each season is advanced by {@link SeasonTransitionStep} in its own transaction; a
 * failure is logged and written to the season's {@code last_error}, and the next tick (the retry's clock) tries it again.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SeasonTransitions {

    private final GroupSeasonRepository seasonRepository;
    private final SeasonTransitionStep step;

    /** @return how many seasons changed status */
    public int tick() {
        List<GroupSeason> candidates = seasonRepository.findByStatusInOrderByIdAsc(
                EnumSet.of(SeasonStatus.SCHEDULED, SeasonStatus.ONGOING, SeasonStatus.COMPLETED));
        int changed = 0;
        for (GroupSeason season : candidates) {
            try {
                if (step.advance(season.getId())) {
                    changed++;
                }
            } catch (Exception e) {
                log.error("Season {} could not be advanced; the next tick retries", season.getId(), e);
                try {
                    step.recordError(season.getId(), e.getClass().getSimpleName() + ": " + e.getMessage());
                } catch (Exception recordFailure) {
                    log.warn("Season {}: the error could not be recorded", season.getId(), recordFailure);
                }
            }
        }
        return changed;
    }
}

package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.LeaderboardEntry;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.StatBoardChangeRepository;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatBoardRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/**
 * SESSION-54: the ranking job's writes, each in a transaction of its own (the caller is not transactional, as with
 * {@code SessionStatsWriter}): the claim on a board, a board's publication, a failure, and the creation of a country board's row.
 * A publication is <b>one transaction</b>: the trees, the deletion of the change rows up to the cutoff, and the end of the run
 * (which only succeeds for the run that still owns the claim: a worker whose claim was taken over after the stale limit rolls its
 * whole publication back).
 */
@Service
@RequiredArgsConstructor
public class LeaderboardWriter {

    /** What to publish for one board. */
    public record Publication(StatBoardRun run, Instant claimedAt, Instant now, LeaderboardBoardBuilder.Computation computation,
                              boolean markCountryDirty) {
    }

    private final StatBoardRunRepository runs;
    private final StatBoardChangeRepository changes;
    private final LeaderboardEntryRepository entries;

    /** @return true if this call took the board (compare-and-set), false if it is claimed by another worker or not found */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claim(StatBoardRun run, Instant now, Instant staleBefore) {
        return runs.claim(run.getSportId(), run.getScopeType(), run.getScopeId(), now, staleBefore) == 1;
    }

    /** Creates a country board's run row when it has none; a concurrent creator's duplicate-key error is the caller's to absorb. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureBoardRun(Long sportId, String scopeType, Long scopeId, Long countryId) {
        if (!runs.existsById(new StatBoardRun.Key(sportId, scopeType, scopeId))) {
            runs.saveAndFlush(new StatBoardRun(sportId, scopeType, scopeId, countryId));
        }
    }

    /** Records a failed run: the board stays dirty and is tried again at {@code next}. Changes nothing if the claim is not this run's. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(StatBoardRun run, Instant claimedAt, String error, Instant next) {
        String message = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        runs.fail(run.getSportId(), run.getScopeType(), run.getScopeId(), claimedAt, message, next);
    }

    /**
     * Publishes a built board.
     *
     * @throws IllegalStateException when the claim is no longer this run's (nothing is written)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void publish(Publication publication) {
        StatBoardRun run = publication.run();
        LeaderboardBoardBuilder.Computation computation = publication.computation();
        int rulesVersion = 0;
        for (LeaderboardBoardBuilder.Result result : computation.results()) {
            LeaderboardEntry row = entries.findById(new LeaderboardEntry.Key(run.getSportId(), run.getScopeType(), run.getScopeId(),
                    result.kind())).orElseGet(() -> new LeaderboardEntry(run.getSportId(), run.getScopeType(), run.getScopeId(),
                    result.kind()));
            Map<String, Object> json = result.tree().toJson(result.previous(), result.cap());
            json.put("require", result.rule().require().toJson());
            row.setTree(json);
            row.setEntries(((Number) json.get("n")).intValue());
            row.setRulesVersion(result.rule().version());
            row.setComputedAt(publication.now());
            entries.save(row);
            rulesVersion = Math.max(rulesVersion, result.rule().version());
        }
        for (String kind : computation.deleteKinds()) {
            entries.deleteById(new LeaderboardEntry.Key(run.getSportId(), run.getScopeType(), run.getScopeId(), kind));
        }
        if (computation.cutoff() != null) {
            changes.deleteUpTo(run.getSportId(), run.getScopeType(), run.getScopeId(), computation.cutoff());
        }
        int finished = runs.finish(run.getSportId(), run.getScopeType(), run.getScopeId(), publication.claimedAt(),
                run.getDirtyAt(), publication.now(), rulesVersion);
        if (finished != 1) {
            throw new IllegalStateException("The ranking claim on board " + run.getScopeType() + " " + run.getScopeId()
                    + " is no longer this run's; nothing was published");
        }
        if (computation.anotherPass()) {
            runs.markDirty(run.getSportId(), run.getScopeType(), run.getScopeId(), publication.now());
        }
        if (publication.markCountryDirty() && run.getCountryId() != null) {
            runs.markDirty(run.getSportId(), "COUNTRY", run.getCountryId(), publication.now());
        }
    }
}

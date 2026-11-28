package com.sportconnect.session.season;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * SESSION-55: takes a season's row lock for the rest of the caller's transaction and returns the season <b>as it is now</b>. The lock is a native
 * {@code SELECT ... FOR UPDATE}; a caller that waited for another transaction's lock must not act on the state it read before waiting, so the
 * entity is refreshed with a second statement once the lock is held (PostgreSQL re-reads the locked row itself, H2's {@code FOR UPDATE} answers
 * the version it began with: found by the real-concurrency test of two simultaneous counts, which both counted the session). Everything that
 * changes a season's status, ledger or rows goes through here.
 */
@Component
@RequiredArgsConstructor
public class SeasonRowLock {

    private final GroupSeasonRepository seasonRepository;

    @PersistenceContext
    private EntityManager entityManager;

    /** Waits for the lock; empty when there is no such season. */
    public Optional<GroupSeason> lock(Long seasonId) {
        Optional<GroupSeason> season = seasonRepository.findByIdForUpdate(seasonId);
        season.ifPresent(entityManager::refresh);
        return season;
    }

    /** Skips a season another transaction holds (empty then, as when there is none). */
    public Optional<GroupSeason> lockOrSkip(Long seasonId) {
        Optional<GroupSeason> season = seasonRepository.findByIdForUpdateSkipLocked(seasonId);
        season.ifPresent(entityManager::refresh);
        return season;
    }
}

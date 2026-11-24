package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface StatBoardRunRepository extends JpaRepository<StatBoardRun, StatBoardRun.Key> {

    /**
     * Marks a board dirty with one atomic update (no read-modify-write), so two sessions touching the same board at once
     * both leave it dirty and neither overwrites the other.
     *
     * @return 1 if the board's row exists (the caller ensures it first), 0 otherwise
     */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.dirty = true, r.dirtyAt = :now "
            + "WHERE r.sportId = :sportId AND r.scopeType = :scopeType AND r.scopeId = :scopeId")
    int markDirty(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                  @Param("scopeId") Long scopeId, @Param("now") Instant now);
}

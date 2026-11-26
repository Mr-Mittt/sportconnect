package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface LeaderboardEntryRepository extends JpaRepository<LeaderboardEntry, LeaderboardEntry.Key> {

    /** The boards of one scope type and kind for these scope ids (the region boards of a country, for the country's merge). */
    @Query("SELECT e FROM LeaderboardEntry e WHERE e.sportId = :sportId AND e.scopeType = :scopeType AND e.kind = :kind "
            + "AND e.scopeId IN :scopeIds ORDER BY e.scopeId")
    List<LeaderboardEntry> findBoards(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                                      @Param("kind") String kind, @Param("scopeIds") Collection<Long> scopeIds);

    /** SESSION-54 slice B: when a board was last published (cheap: the tree is not read), empty when it has none. */
    @Query("SELECT e.computedAt FROM LeaderboardEntry e WHERE e.sportId = :sportId AND e.scopeType = :scopeType "
            + "AND e.scopeId = :scopeId AND e.kind = :kind")
    java.util.Optional<java.time.Instant> findComputedAt(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                                                         @Param("scopeId") Long scopeId, @Param("kind") String kind);
}

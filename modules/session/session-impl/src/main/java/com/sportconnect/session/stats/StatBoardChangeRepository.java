package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface StatBoardChangeRepository extends JpaRepository<StatBoardChange, Long> {

    /** The highest change id of a board, the cutoff of one ranking run ({@code null} when the board has no change rows). */
    @Query("SELECT MAX(c.id) FROM StatBoardChange c WHERE c.sportId = :sportId AND c.scopeType = :scopeType AND c.scopeId = :scopeId")
    Long maxId(@Param("sportId") Long sportId, @Param("scopeType") String scopeType, @Param("scopeId") Long scopeId);

    /** The players with a change row up to the cutoff, each once, in user id order. */
    @Query("SELECT DISTINCT c.userId FROM StatBoardChange c WHERE c.sportId = :sportId AND c.scopeType = :scopeType "
            + "AND c.scopeId = :scopeId AND c.id <= :cutoff ORDER BY c.userId")
    List<UUID> findUserIdsUpTo(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                               @Param("scopeId") Long scopeId, @Param("cutoff") Long cutoff);

    /** Deletes the rows up to the cutoff only: a row inserted while the run was going (a higher id) is kept for the next run. */
    @Modifying
    @Query("DELETE FROM StatBoardChange c WHERE c.sportId = :sportId AND c.scopeType = :scopeType AND c.scopeId = :scopeId "
            + "AND c.id <= :cutoff")
    int deleteUpTo(@Param("sportId") Long sportId, @Param("scopeType") String scopeType, @Param("scopeId") Long scopeId,
                   @Param("cutoff") Long cutoff);
}

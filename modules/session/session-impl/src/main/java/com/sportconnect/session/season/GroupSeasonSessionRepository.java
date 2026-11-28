package com.sportconnect.session.season;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/** SESSION-55: the sessions linked to MANUAL seasons. */
public interface GroupSeasonSessionRepository extends JpaRepository<GroupSeasonSession, GroupSeasonSession.Key> {

    List<GroupSeasonSession> findBySeasonId(Long seasonId);

    long countBySeasonId(Long seasonId);

    /** How many sessions each of these seasons has linked, in one query. */
    @Query("SELECT l.seasonId AS seasonId, COUNT(l) AS count FROM GroupSeasonSession l WHERE l.seasonId IN :seasonIds GROUP BY l.seasonId")
    List<LinkCount> countBySeasonIds(@Param("seasonIds") Collection<Long> seasonIds);

    /** The links of these sessions: what the statistics engine asks, once per counted session. */
    List<GroupSeasonSession> findBySessionId(Long sessionId);

    void deleteBySeasonIdAndSessionIdIn(Long seasonId, Collection<Long> sessionIds);

    /** A projection of {@link #countBySeasonIds}. */
    interface LinkCount {
        Long getSeasonId();

        Long getCount();
    }
}

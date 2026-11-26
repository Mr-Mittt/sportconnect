package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SportRankingRuleRepository extends JpaRepository<SportRankingRule, SportRankingRule.Key> {

    /** Every rule of a sport, the default first, for the admin's list. */
    @Query("SELECT r FROM SportRankingRule r WHERE r.sportId = :sportId ORDER BY r.scopeType, r.scopeId, r.kind")
    List<SportRankingRule> findAllOfSport(@Param("sportId") Long sportId);
}

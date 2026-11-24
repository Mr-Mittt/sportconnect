package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LeaderboardEntryRepository extends JpaRepository<LeaderboardEntry, LeaderboardEntry.Key> {
}

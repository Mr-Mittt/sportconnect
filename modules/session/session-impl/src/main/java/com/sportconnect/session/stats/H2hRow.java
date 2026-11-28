package com.sportconnect.session.stats;

import java.time.Instant;
import java.util.Map;

/**
 * SESSION-55: a head-to-head row, whichever table keeps it: a group's ({@link GroupStats}) or a season's ({@link SeasonStats}); both hold the
 * one {@code h2h} document that {@link GroupH2hDoc} reads and writes.
 */
public interface H2hRow {

    Map<String, Object> getH2h();

    void setH2h(Map<String, Object> h2h);

    void setUpdatedAt(Instant updatedAt);
}

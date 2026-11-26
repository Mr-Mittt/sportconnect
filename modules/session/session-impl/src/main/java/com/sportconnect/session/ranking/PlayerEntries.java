package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.GroupStatsDoc;
import com.sportconnect.session.stats.PlayerStatsDoc;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsCounters;

import java.util.Map;

/**
 * SESSION-54: what one player has on one board's place: their own counters (the {@code SINGLE} entry) and the counters of each
 * partner (one {@code PARTNER} entry per pair). Read from the player's statistics blob for a region or the country, or from the
 * group member's row for a group; {@code single} is {@code null} when nothing was counted there. The partner keys are the
 * partner's user id (a region or country) or the partner's group member number (a group).
 */
public record PlayerEntries(StatsCounters single, Map<String, StatsCounters> partners) {

    public static final PlayerEntries NONE = new PlayerEntries(null, Map.of());

    /** The player's ranking games at one region, or {@link #NONE}. */
    public static PlayerEntries ofRegion(PlayerStatsDoc doc, Long regionId) {
        for (PlayerStatsDoc.Scope scope : doc.scopes()) {
            if ("REGION".equals(scope.scope()) && regionId.equals(scope.regionId())) {
                return of(scope);
            }
        }
        return NONE;
    }

    /** The player's ranking games at one country (all its regions), or {@link #NONE}. */
    public static PlayerEntries ofCountry(PlayerStatsDoc doc, Long countryId) {
        for (PlayerStatsDoc.Scope scope : doc.scopes()) {
            if ("COUNTRY".equals(scope.scope()) && countryId.equals(scope.countryId())) {
                return of(scope);
            }
        }
        return NONE;
    }

    private static PlayerEntries of(PlayerStatsDoc.Scope scope) {
        return new PlayerEntries(scope.counters().isEmpty() ? null : scope.counters(), scope.groups(StatisticsSchema.PARTNER));
    }

    /** A group member's games in the group's sessions (every game, ranking or not). */
    public static PlayerEntries ofGroup(GroupStatsDoc doc) {
        Map<String, StatsCounters> partners = doc.groupings().getOrDefault(StatisticsSchema.PARTNER, Map.of());
        return new PlayerEntries(doc.counters().isEmpty() ? null : doc.counters(), partners);
    }

    /**
     * SESSION-83 (C): the same, for a group that switched some stats off for its member row: those stats have no value (a stored
     * number from before the switch is not read), so a precondition on one lists nobody and a sort key on one ties everyone.
     */
    public static PlayerEntries ofGroup(GroupStatsDoc doc, java.util.Set<String> disabled) {
        if (disabled.isEmpty()) {
            return ofGroup(doc);
        }
        StatsCounters counters = doc.counters().without(disabled);
        return new PlayerEntries(counters.isEmpty() ? null : counters, doc.groupings().getOrDefault(StatisticsSchema.PARTNER, Map.of()));
    }
}

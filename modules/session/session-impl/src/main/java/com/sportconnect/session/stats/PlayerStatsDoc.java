package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * SESSION-53: the working copy of one {@link UserSportStats} row. Reads the blobs into typed counters, lets the job change
 * them in code, and writes them back; the jsonb shapes live here and nowhere else:
 *
 * <ul>
 *   <li>{@code personal}: {@code {all: counters, ranked: counters}}</li>
 *   <li>{@code groupings}: {@code {PARTNER: {<partnerId>: {all, ranked}}, TEAM: {<comboKey>: {all, ranked}}}}, the counters of
 *       the games played with each teammate, and with each team of {@code size} players ({@link StatsGroupings})</li>
 *   <li>{@code scopes}: {@code [{scope: REGION|COUNTRY, countryId, regionId, counters, groupings: {<by>: {<key>: counters}}}]},
 *       the ranking games counted at one place</li>
 *   <li>{@code history}: the pointers of {@link StatsHistory}</li>
 * </ul>
 * The full reference is {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 */
public final class PlayerStatsDoc {

    /** The counters of all games and of the ranking games among them. */
    public static final class AllRanked {
        private final StatsCounters all;
        private final StatsCounters ranked;

        AllRanked(StatsCounters all, StatsCounters ranked) {
            this.all = all;
            this.ranked = ranked;
        }

        public StatsCounters all() {
            return all;
        }

        public StatsCounters ranked() {
            return ranked;
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("all", all.toMap());
            map.put("ranked", ranked.toMap());
            return map;
        }

        static AllRanked fromMap(Object node) {
            Map<?, ?> map = node instanceof Map<?, ?> m ? m : Map.of();
            return new AllRanked(StatsCounters.fromMap(map.get("all")), StatsCounters.fromMap(map.get("ranked")));
        }
    }

    /** The ranking games counted at one region or country. */
    public static final class Scope {
        private final String scope;
        private final Long countryId;
        private final Long regionId;
        private final StatsCounters counters;
        private final Map<String, Map<String, StatsCounters>> groupings;

        Scope(String scope, Long countryId, Long regionId, StatsCounters counters,
              Map<String, Map<String, StatsCounters>> groupings) {
            this.scope = scope;
            this.countryId = countryId;
            this.regionId = regionId;
            this.counters = counters;
            this.groupings = groupings;
        }

        public String scope() {
            return scope;
        }

        public StatsCounters counters() {
            return counters;
        }

        /** The country of the place; for a {@code COUNTRY} entry the place itself. */
        public Long countryId() {
            return countryId;
        }

        /** The region of the place; {@code null} for a {@code COUNTRY} entry. */
        public Long regionId() {
            return regionId;
        }

        /** The counters of one group (a partner, a team) at this place (created empty the first time). */
        public StatsCounters group(String by, String key) {
            return StatsGroupings.group(groupings, by, key, StatsCounters::new);
        }

        boolean matches(String scopeType, Long country, Long region) {
            return scope.equals(scopeType) && java.util.Objects.equals(countryId, country)
                    && java.util.Objects.equals(regionId, region);
        }

        Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("scope", scope);
            map.put("countryId", countryId);
            map.put("regionId", regionId);
            map.put("counters", counters.toMap());
            map.put("groupings", StatsGroupings.write(groupings, StatsCounters::toMap));
            return map;
        }

        static Scope fromMap(Map<?, ?> map) {
            return new Scope(String.valueOf(map.get("scope")), longOrNull(map.get("countryId")),
                    longOrNull(map.get("regionId")), StatsCounters.fromMap(map.get("counters")),
                    StatsGroupings.read(map.get("groupings"), StatsCounters::fromMap));
        }
    }

    private final AllRanked personal;
    private final Map<String, Map<String, AllRanked>> groupings;
    private final List<Scope> scopes;
    private List<Object> history;

    private PlayerStatsDoc(AllRanked personal, Map<String, Map<String, AllRanked>> groupings, List<Scope> scopes,
                           List<Object> history) {
        this.personal = personal;
        this.groupings = groupings;
        this.scopes = scopes;
        this.history = history;
    }

    /** Reads a row's blobs; an empty row (a new player) reads as no games. */
    public static PlayerStatsDoc read(UserSportStats row) {
        AllRanked personal = AllRanked.fromMap(row.getPersonal());
        Map<String, Map<String, AllRanked>> groupings = StatsGroupings.read(row.getGroupings(), AllRanked::fromMap);
        List<Scope> scopes = new ArrayList<>();
        if (row.getScopes() != null) {
            for (Object entry : row.getScopes()) {
                if (entry instanceof Map<?, ?> map) {
                    scopes.add(Scope.fromMap(map));
                }
            }
        }
        List<Object> history = row.getHistory() == null ? new ArrayList<>() : new ArrayList<>(row.getHistory());
        return new PlayerStatsDoc(personal, groupings, scopes, history);
    }

    /** Writes the blobs back into the row, which the caller holds a lock on. */
    public void writeTo(UserSportStats row) {
        row.setPersonal(personal.toMap());
        row.setGroupings(StatsGroupings.write(groupings, AllRanked::toMap));
        List<Object> scopeList = new ArrayList<>();
        scopes.forEach(scope -> scopeList.add(scope.toMap()));
        row.setScopes(scopeList);
        row.setHistory(new ArrayList<>(history));
        row.setUpdatedAt(java.time.Instant.now());
    }

    public AllRanked personal() {
        return personal;
    }

    /**
     * SESSION-73: every group the player has counters for, {@code by} dimension then key, for reading (it does not create
     * the empty entry that {@link #group} makes, and it must not be changed).
     */
    public Map<String, Map<String, AllRanked>> groupings() {
        return java.util.Collections.unmodifiableMap(groupings);
    }

    /** SESSION-73: the place entries, for reading. */
    public List<Scope> scopes() {
        return java.util.Collections.unmodifiableList(scopes);
    }

    /** SESSION-73: the history pointers, newest first. */
    public List<StatsHistory.Pointer> pointers() {
        return StatsHistory.read(history);
    }

    /** The counters of one group, {@code by} a partner or a team (created empty the first time). */
    public AllRanked group(String by, String key) {
        return StatsGroupings.group(groupings, by, key, () -> new AllRanked(new StatsCounters(), new StatsCounters()));
    }

    /** The entry for one place (created empty the first time). */
    public Scope scope(String scopeType, Long countryId, Long regionId) {
        for (Scope scope : scopes) {
            if (scope.matches(scopeType, countryId, regionId)) {
                return scope;
            }
        }
        Scope created = new Scope(scopeType, countryId, regionId, new StatsCounters(), new TreeMap<>());
        scopes.add(created);
        return created;
    }

    public boolean hasPointer(long recordId) {
        return StatsHistory.contains(history, recordId);
    }

    public void addPointer(long recordId, long sessionId, boolean ranking) {
        history = StatsHistory.prepend(history, recordId, sessionId, ranking);
    }

    private static Long longOrNull(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }
}

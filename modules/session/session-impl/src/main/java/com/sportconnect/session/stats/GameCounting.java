package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

/**
 * SESSION-55 (extracted from {@link SessionStatsProcessor}): the pure helpers that turn a game's players into the group keys a group's rows
 * (and a season's) count under. Shared by the statistics engine and by {@code SeasonStatsCounter}, so a season counts a game exactly as its
 * group does. No state, no repository.
 */
public final class GameCounting {

    private GameCounting() {
    }

    /**
     * The group keys of one player in one game, by dimension, for the grouping the sport's schema asks for: {@code PARTNER}
     * (each other member of the team) or {@code TEAM} (every team of the schema's size the player is in).
     */
    public static Map<String, List<String>> groupKeys(StatisticsSchema stats, UUID player, List<UUID> team) {
        Map<String, List<String>> keys = new LinkedHashMap<>();
        for (StatisticsSchema.Grouping grouping : stats.groupBy()) {
            List<String> list = grouping.by().equals(StatisticsSchema.PARTNER)
                    ? StatsCombos.partnersOf(player, team) : StatsCombos.keysFor(player, team, grouping.size());
            if (!list.isEmpty()) {
                keys.put(grouping.by(), list);
            }
        }
        return keys;
    }

    /**
     * The same group keys as a group's rows keep them (SESSION-81): a partner is the partner's member number, a team the members' numbers
     * sorted and joined by commas. (A player's own rows keep the user ids: their partners come from many groups.)
     */
    public static Map<String, List<String>> memberKeys(Map<String, List<String>> groups, Map<UUID, Integer> numbers) {
        Map<String, List<String>> converted = new LinkedHashMap<>();
        groups.forEach((by, keys) -> {
            List<String> list = new ArrayList<>();
            for (String key : keys) {
                List<Integer> parts = new ArrayList<>();
                for (String id : key.split(",")) {
                    parts.add(numbers.get(UUID.fromString(id)));
                }
                parts.sort(null);
                list.add(parts.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            converted.put(by, list);
        });
        return converted;
    }

    public static List<Integer> numbersOf(List<UUID> team, Map<UUID, Integer> numbers) {
        return team.stream().map(numbers::get).toList();
    }

    /** Adds one player's game to the counters of each of their groups. */
    public static void addToGroups(Map<String, List<String>> groups, BiFunction<String, String, StatsCounters> counters,
                                   RecordFacts.Participant p, StatisticsSchema stats) {
        groups.forEach((by, keys) -> keys.forEach(key -> counters.apply(by, key).add(p.outcome(), p.metrics(), stats.collectedForCombos())));
    }

    /** A game of two teams of exactly two players: the only game the head-to-head counts. */
    public static boolean isTwoPairs(RecordFacts facts) {
        List<List<UUID>> teams = facts.teams();
        return teams.size() == 2 && teams.get(0).size() == 2 && teams.get(1).size() == 2;
    }

    /** How the game ended for the first team, from the outcome of its first player. */
    public static RecordFacts.Outcome outcomeOfFirstTeam(RecordFacts facts) {
        return facts.participants().stream().filter(p -> p.team() == 0).map(RecordFacts.Participant::outcome)
                .findFirst().orElse(RecordFacts.Outcome.NONE);
    }
}

package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-53: the combos of one team's players that get counters of their own (badminton: every pair). A combo is
 * identified by its members' ids sorted and joined by commas, so the same two players always share one key whatever order
 * a record lists them in.
 */
final class StatsCombos {

    /** A team so big that its combos would be hundreds is given none: a combo board is meant for pairs and trios. */
    static final int MAX_COMBOS_PER_TEAM = 100;

    private StatsCombos() {
    }

    /**
     * The {@code PARTNER} keys of {@code player}: the id of each other member of {@code team}, sorted. Empty for a team of
     * one, or a team with more other members than {@value #MAX_COMBOS_PER_TEAM}.
     */
    static List<String> partnersOf(UUID player, List<UUID> team) {
        if (team.size() - 1 > MAX_COMBOS_PER_TEAM) {
            return List.of();
        }
        return team.stream().filter(member -> !member.equals(player)).map(UUID::toString).distinct().sorted().toList();
    }

    /** The key of a combo of players. */
    static String key(List<UUID> members) {
        return members.stream().map(UUID::toString).sorted().collect(Collectors.joining(","));
    }

    /**
     * The keys of every combo of {@code size} players of {@code team} that includes {@code player}; empty when the size is
     * below 2, the team is smaller than the size, or the team has more combos than {@value #MAX_COMBOS_PER_TEAM}.
     */
    static List<String> keysFor(UUID player, List<UUID> team, int size) {
        if (size < 2 || team.size() < size || binomial(team.size(), size) > MAX_COMBOS_PER_TEAM) {
            return List.of();
        }
        List<UUID> sorted = team.stream().sorted(Comparator.comparing(UUID::toString)).toList();
        List<String> keys = new ArrayList<>();
        collect(sorted, size, 0, new ArrayList<>(), player, keys);
        return keys;
    }

    private static void collect(List<UUID> sorted, int size, int from, List<UUID> chosen, UUID player, List<String> out) {
        if (chosen.size() == size) {
            if (chosen.contains(player)) {
                out.add(key(chosen));
            }
            return;
        }
        for (int i = from; i < sorted.size(); i++) {
            chosen.add(sorted.get(i));
            collect(sorted, size, i + 1, chosen, player, out);
            chosen.remove(chosen.size() - 1);
        }
    }

    private static long binomial(int n, int k) {
        long result = 1;
        for (int i = 1; i <= k; i++) {
            result = result * (n - k + i) / i;
            if (result > MAX_COMBOS_PER_TEAM * 1000L) {
                return result;
            }
        }
        return result;
    }
}

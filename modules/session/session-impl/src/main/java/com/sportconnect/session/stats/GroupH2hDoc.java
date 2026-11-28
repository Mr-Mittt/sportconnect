package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts.Outcome;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SESSION-53 rework (owner, 2026-11-25), SESSION-81: the head-to-head of a group's pairs, the working copy of one
 * {@link GroupStats} row's {@code h2h} document. One document per group and sport:
 *
 * <pre>
 * { "seq": 4711,                                           the group's running game number
 *   "h2h": { "1.2-3.4": [2, 1, 4711],                      pair 1.2 beat pair 3.4 twice, lost once, last played game 4711
 *            "1.5-3.4": [1, 0, 1, 4650] } }                with draws: [wins1, wins2, draws, seq]
 * </pre>
 *
 * The numbers in a key are the members' <b>permanent group member numbers</b> ({@code GroupMemberNumberService}, owned by the
 * group module: unique inside the group, never reused, kept when a member leaves), so this document keeps no member
 * dictionary of its own. A pair is its two numbers, the smaller first ({@code "a.b"}); a matchup key is the <b>smaller pair
 * first</b> ({@link #matchupKey}, the one rule, so a lookup never has to try both orders), and the wins in the value follow
 * the key: the first number is the wins of the first pair of the key. The value's length says whether draws are kept (3
 * without, 4 with: a sport whose {@code record.data.allowDraws} is true). The last number is the {@code seq} of the game the
 * matchup was last played in. The document keeps the latest {@value #MAX_MATCHUPS} matchups: when a new one would pass the
 * cap, the least recently played (the smallest {@code seq}) is dropped.
 *
 * <p>Only a game of two pairs (two teams of exactly two players) is a matchup; anything else adds nothing here. A document
 * written before SESSION-81 may still hold a {@code members} dictionary; it is ignored (the statistics tables are rebuilt).
 */
public final class GroupH2hDoc {

    /** The matchups kept per group and sport: the least recently played is dropped beyond it (measured: 5,000 is about 55 KB). */
    public static final int MAX_MATCHUPS = 5000;

    private long seq;
    private final Map<String, long[]> matchups = new LinkedHashMap<>();

    private GroupH2hDoc() {
    }

    /** Reads a row's document; an empty row reads as no games. */
    public static GroupH2hDoc read(H2hRow row) {
        GroupH2hDoc doc = new GroupH2hDoc();
        Map<String, Object> h2h = row.getH2h() == null ? Map.of() : row.getH2h();
        doc.seq = h2h.get("seq") instanceof Number n ? n.longValue() : 0L;
        if (h2h.get("h2h") instanceof Map<?, ?> matchupMap) {
            matchupMap.forEach((key, value) -> {
                if (value instanceof List<?> list && (list.size() == 3 || list.size() == 4)
                        && list.stream().allMatch(Number.class::isInstance)) {
                    long[] entry = new long[list.size()];
                    for (int i = 0; i < entry.length; i++) {
                        entry[i] = ((Number) list.get(i)).longValue();
                    }
                    doc.matchups.put(String.valueOf(key), entry);
                }
            });
        }
        return doc;
    }

    /** Writes the document back into the row, which the caller holds a lock on. */
    public void writeTo(H2hRow row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("seq", seq);
        Map<String, Object> h2h = new LinkedHashMap<>();
        matchups.forEach((key, entry) -> {
            List<Object> list = new ArrayList<>();
            for (long value : entry) {
                list.add(value);
            }
            h2h.put(key, list);
        });
        out.put("h2h", h2h);
        row.setH2h(out);
        row.setUpdatedAt(java.time.Instant.now());
    }

    /**
     * Counts one game between two pairs.
     *
     * @param teamA       the two members of the first team, by their group member numbers
     * @param teamB       the two members of the second team, by their group member numbers
     * @param outcomeOfA  how the game ended for the first team; {@code NONE}, and a {@code DRAW} when the sport does not
     *                    allow draws, are not recorded
     * @param allowDraws  whether the sport keeps draws (the value then has a draws element)
     * @return whether the game was recorded
     */
    public boolean addGame(List<Integer> teamA, List<Integer> teamB, Outcome outcomeOfA, boolean allowDraws) {
        if (teamA.size() != 2 || teamB.size() != 2) {
            return false;
        }
        boolean draw = outcomeOfA == Outcome.DRAW;
        if (outcomeOfA == Outcome.NONE || (draw && !allowDraws)) {
            return false;
        }
        int[] pairA = order(teamA.get(0), teamA.get(1));
        int[] pairB = order(teamB.get(0), teamB.get(1));
        boolean aFirst = comparePairs(pairA, pairB) < 0;
        String key = matchupKey(pairA, pairB);
        seq++;

        long[] entry = matchups.get(key);
        if (entry == null) {
            entry = allowDraws ? new long[]{0, 0, 0, seq} : new long[]{0, 0, seq};
        } else if (allowDraws && entry.length == 3) {
            entry = new long[]{entry[0], entry[1], 0, entry[2]};
        }
        int last = entry.length - 1;
        if (draw) {
            entry[2]++;
        } else if ((outcomeOfA == Outcome.WIN) == aFirst) {
            entry[0]++;
        } else {
            entry[1]++;
        }
        entry[last] = seq;
        matchups.put(key, entry);
        if (matchups.size() > MAX_MATCHUPS) {
            dropLeastRecent();
        }
        return true;
    }

    /**
     * SESSION-55: takes another document's games back out (the head-to-head a removed session of a season added to a blank document): each
     * matchup loses its wins (and draws), never below zero, and a matchup left with none is dropped. The sequence number is not rolled back.
     */
    public void subtract(GroupH2hDoc contribution) {
        contribution.matchups.forEach((key, gone) -> {
            long[] mine = matchups.get(key);
            if (mine == null) {
                return;
            }
            int counts = mine.length - 1;
            boolean any = false;
            for (int i = 0; i < counts; i++) {
                long took = i < gone.length - 1 ? gone[i] : 0L;
                mine[i] = Math.max(0L, mine[i] - took);
                any |= mine[i] > 0;
            }
            if (!any) {
                matchups.remove(key);
            }
        });
    }

    /** The matchup of two pairs as {@code [winsOfFirst, winsOfSecond(, draws), seq]} in key order, or null; for tests and reads. */
    public long[] matchup(List<Integer> teamA, List<Integer> teamB) {
        long[] entry = matchups.get(matchupKey(order(teamA.get(0), teamA.get(1)), order(teamB.get(0), teamB.get(1))));
        return entry == null ? null : entry.clone();
    }

    public int size() {
        return matchups.size();
    }

    public long seq() {
        return seq;
    }

    /** The key of the matchup of two pairs: the smaller pair first, each pair its two member numbers, the smaller first. */
    public static String matchupKey(int[] pairA, int[] pairB) {
        boolean aFirst = comparePairs(pairA, pairB) <= 0;
        int[] first = aFirst ? pairA : pairB;
        int[] second = aFirst ? pairB : pairA;
        return first[0] + "." + first[1] + "-" + second[0] + "." + second[1];
    }

    /** The two member numbers as a pair: the smaller first. */
    public static int[] order(int a, int b) {
        return a <= b ? new int[]{a, b} : new int[]{b, a};
    }

    private static int comparePairs(int[] x, int[] y) {
        int byFirst = Integer.compare(x[0], y[0]);
        return byFirst != 0 ? byFirst : Integer.compare(x[1], y[1]);
    }

    private void dropLeastRecent() {
        String oldest = null;
        long oldestSeq = Long.MAX_VALUE;
        for (Map.Entry<String, long[]> matchup : matchups.entrySet()) {
            long[] entry = matchup.getValue();
            long last = entry[entry.length - 1];
            if (last < oldestSeq) {
                oldestSeq = last;
                oldest = matchup.getKey();
            }
        }
        if (oldest != null) {
            matchups.remove(oldest);
        }
    }
}

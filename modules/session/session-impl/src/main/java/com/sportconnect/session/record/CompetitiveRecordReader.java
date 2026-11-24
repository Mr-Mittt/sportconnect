package com.sportconnect.session.record;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The reader of {@code COMPETITIVE} records (SESSION-72, shared with the statistics engine, SESSION-53): two teams, a
 * score per team and score slot, the first team is the winner by position
 * ({@code documentation/md/RECORD_SCHEMA_CONTRACT.md}).
 *
 * <p><b>Valid</b> when the record has exactly two teams, each with between {@code playersPerSide.min} and {@code .max}
 * players (defaults 1 and 10), every player a UUID, no player twice (inside a team or across them) and the scores
 * consistent the way the contract says: at most one score per slot, each entry empty or a whole number, for every slot
 * both teams fill it or neither does, a filled score satisfies the slot's {@code rule}, and a team with any score filled
 * fills all its {@code required} slots. A record with no score at all is valid: a planned game.
 *
 * <p><b>Rankable</b> when valid and the ranking slot ({@code record.ranking.scoreSlot}, default the first) is filled by
 * both teams with the first team strictly ahead. Not rankable reasons: {@code NO_SCORE} (a planned game),
 * {@code FIRST_TEAM_NOT_AHEAD}, or the invalid reason.
 *
 * <p>Pure: never throws for a malformed record, it answers {@code valid = false}.
 */
@Component
public class CompetitiveRecordReader implements RecordTypeReader {

    static final String TYPE = "COMPETITIVE";
    private static final int DEFAULT_MIN_PLAYERS = 1;
    private static final int DEFAULT_MAX_PLAYERS = 10;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supportsRanking(Map<String, Object> schema) {
        return !slots(schema).isEmpty();
    }

    @Override
    public RecordFacts read(Map<String, Object> schema, Map<String, Object> data) {
        List<Slot> slots = slots(schema);
        int min = intOf(map(map(map(schema, "record"), "data"), "playersPerSide").get("min"), DEFAULT_MIN_PLAYERS);
        int max = intOf(map(map(map(schema, "record"), "data"), "playersPerSide").get("max"), DEFAULT_MAX_PLAYERS);

        Object teamsNode = data == null ? null : data.get("teams");
        if (!(teamsNode instanceof List<?> teams) || teams.size() != 2) {
            return RecordFacts.invalid("TEAMS");
        }
        List<UUID> players = new ArrayList<>();
        List<List<UUID>> teamPlayers = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        List<List<Long>> scores = new ArrayList<>();
        for (Object teamNode : teams) {
            if (!(teamNode instanceof Map<?, ?> team) || !(team.get("players") instanceof List<?> ids)) {
                return RecordFacts.invalid("TEAMS");
            }
            if (ids.size() < min || ids.size() > max) {
                return RecordFacts.invalid("PLAYERS_PER_SIDE");
            }
            List<UUID> thisTeam = new ArrayList<>();
            for (Object id : ids) {
                UUID parsed = uuidOf(id);
                if (parsed == null) {
                    return RecordFacts.invalid("PLAYER_ID");
                }
                if (!seen.add(parsed)) {
                    return RecordFacts.invalid("DUPLICATE_PLAYER");
                }
                players.add(parsed);
                thisTeam.add(parsed);
            }
            teamPlayers.add(List.copyOf(thisTeam));
            List<Long> teamScores = scoresOf(team.get("scores"), slots.size());
            if (teamScores == null) {
                return RecordFacts.invalid("SCORE_SHAPE");
            }
            scores.add(teamScores);
        }

        String scoreProblem = checkScores(slots, scores.get(0), scores.get(1));
        if (scoreProblem != null) {
            return RecordFacts.invalid(scoreProblem);
        }

        List<UUID> named = List.copyOf(players);
        List<List<UUID>> sides = List.copyOf(teamPlayers);
        if (slots.isEmpty()) {
            return new RecordFacts(true, null, false, "RANKING_NOT_AVAILABLE", named, sides, List.of());
        }
        int rankingSlot = rankingSlot(schema, slots.size());
        Long first = scores.get(0).get(rankingSlot);
        Long second = scores.get(1).get(rankingSlot);
        if (first == null && second == null) {
            return new RecordFacts(true, null, false, "NO_SCORE", named, sides, List.of());
        }
        // Both filled here: checkScores already refused a slot filled by one team only.
        if (first <= second) {
            return new RecordFacts(true, null, false, "FIRST_TEAM_NOT_AHEAD", named, sides, List.of());
        }
        return new RecordFacts(true, null, true, null, named, sides, participants(sides, scores));
    }

    /**
     * SESSION-53: the first team wins by position (the contract), the second loses. The numbers each player gets are the
     * team's: {@code scoreFor} is the sum of the team's scores over every slot both teams filled, {@code scoreAgainst} the
     * other team's sum.
     */
    private static List<RecordFacts.Participant> participants(List<List<UUID>> sides, List<List<Long>> scores) {
        double[] sum = new double[2];
        for (int slot = 0; slot < scores.get(0).size(); slot++) {
            Long a = scores.get(0).get(slot);
            Long b = scores.get(1).get(slot);
            if (a != null && b != null) {
                sum[0] += a;
                sum[1] += b;
            }
        }
        List<RecordFacts.Participant> result = new ArrayList<>();
        for (int team = 0; team < 2; team++) {
            Map<String, Double> metrics = Map.of("scoreFor", sum[team], "scoreAgainst", sum[1 - team]);
            RecordFacts.Outcome outcome = team == 0 ? RecordFacts.Outcome.WIN : RecordFacts.Outcome.LOSS;
            for (UUID player : sides.get(team)) {
                result.add(new RecordFacts.Participant(player, team, outcome, metrics));
            }
        }
        return List.copyOf(result);
    }

    /** Consistency of the two teams' scores, or the reason it is not. */
    private static String checkScores(List<Slot> slots, List<Long> first, List<Long> second) {
        boolean firstAny = false;
        boolean secondAny = false;
        for (int i = 0; i < slots.size(); i++) {
            Long a = first.get(i);
            Long b = second.get(i);
            if ((a == null) != (b == null)) {
                return "SCORE_INCOMPLETE";
            }
            if (a != null) {
                firstAny = true;
                secondAny = true;
                if (!slots.get(i).accepts(a) || !slots.get(i).accepts(b)) {
                    return "SCORE_RULE";
                }
            }
        }
        if (firstAny || secondAny) {
            for (int i = 0; i < slots.size(); i++) {
                if (slots.get(i).required() && first.get(i) == null) {
                    return "SCORE_INCOMPLETE";
                }
            }
        }
        return null;
    }

    private static int rankingSlot(Map<String, Object> schema, int slotCount) {
        int slot = intOf(map(map(schema, "record"), "ranking").get("scoreSlot"), 0);
        return slot >= 0 && slot < slotCount ? slot : 0;
    }

    /** One score slot of the schema: whether it is required and the rule a filled score must satisfy. */
    private record Slot(boolean required, List<long[]> bounds) {

        /** Each bound is {operator, value}: 0 is {@code >}, 1 {@code >=}, 2 {@code <}, 3 {@code <=}, 4 {@code =}. */
        boolean accepts(long score) {
            for (long[] bound : bounds) {
                boolean ok = switch ((int) bound[0]) {
                    case 0 -> score > bound[1];
                    case 1 -> score >= bound[1];
                    case 2 -> score < bound[1];
                    case 3 -> score <= bound[1];
                    default -> score == bound[1];
                };
                if (!ok) {
                    return false;
                }
            }
            return true;
        }
    }

    private static List<Slot> slots(Map<String, Object> schema) {
        Object slotNode = map(map(map(schema, "record"), "data"), "score").get("slot");
        List<Slot> result = new ArrayList<>();
        if (slotNode instanceof List<?> list) {
            for (Object entry : list) {
                Map<String, Object> slot = map(entry);
                result.add(new Slot(Boolean.TRUE.equals(slot.get("required")), parseRule(slot.get("rule"))));
            }
        }
        return result;
    }

    /** {@code ">=0&<=30"} to bounds; an unreadable rule means "any integer" (the contract). */
    private static List<long[]> parseRule(Object rule) {
        if (!(rule instanceof String text) || text.isBlank()) {
            return List.of();
        }
        List<long[]> bounds = new ArrayList<>();
        for (String part : text.split("&")) {
            String p = part.trim();
            int op;
            String number;
            if (p.startsWith(">=")) {
                op = 1;
                number = p.substring(2);
            } else if (p.startsWith("<=")) {
                op = 3;
                number = p.substring(2);
            } else if (p.startsWith(">")) {
                op = 0;
                number = p.substring(1);
            } else if (p.startsWith("<")) {
                op = 2;
                number = p.substring(1);
            } else if (p.startsWith("=")) {
                op = 4;
                number = p.substring(1);
            } else {
                return List.of();
            }
            try {
                bounds.add(new long[]{op, Long.parseLong(number.trim())});
            } catch (NumberFormatException e) {
                return List.of();
            }
        }
        return bounds;
    }

    /** A team's scores as {@code slotCount} whole numbers or nulls; {@code null} when the shape is wrong. */
    private static List<Long> scoresOf(Object node, int slotCount) {
        List<Long> result = new ArrayList<>();
        if (slotCount == 0) {
            return result;   // the sport defines no score: whatever the record carries there is not read
        }
        if (node == null) {
            for (int i = 0; i < slotCount; i++) {
                result.add(null);
            }
            return result;
        }
        if (!(node instanceof List<?> list) || list.size() > Math.max(slotCount, 0)) {
            return null;
        }
        for (Object value : list) {
            if (value == null) {
                result.add(null);
            } else if (value instanceof Number number && number.doubleValue() == Math.rint(number.doubleValue())) {
                result.add(number.longValue());
            } else {
                return null;
            }
        }
        while (result.size() < slotCount) {
            result.add(null);
        }
        return result;
    }

    private static UUID uuidOf(Object id) {
        if (!(id instanceof String text)) {
            return null;
        }
        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static int intOf(Object value, int fallback) {
        return value instanceof Number number ? number.intValue() : fallback;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object node) {
        return node instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static Map<String, Object> map(Map<String, Object> parent, String key) {
        return map(parent == null ? null : parent.get(key));
    }
}

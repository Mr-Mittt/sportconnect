package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SESSION-53: the history of a statistics blob, pointers {@code {recordId, sessionId, ranking}} to the counted games, newest
 * first, capped at {@value #CAP}. The pointer carries no game detail: a page of history reads the games by id from
 * {@code session_records} and the session. What a session counted is kept once, uncapped, in its job row, so a rebuild never
 * depends on this list.
 */
final class StatsHistory {

    static final int CAP = 500;

    private StatsHistory() {
    }

    /** Whether the history already points at the record (the second line of defence against counting a game twice). */
    static boolean contains(List<Object> history, long recordId) {
        for (Object entry : history) {
            if (entry instanceof Map<?, ?> pointer && pointer.get("recordId") instanceof Number id && id.longValue() == recordId) {
                return true;
            }
        }
        return false;
    }

    /** A new history list with the pointer first and the oldest pointers cut off beyond the cap. */
    static List<Object> prepend(List<Object> history, long recordId, long sessionId, boolean ranking) {
        Map<String, Object> pointer = new LinkedHashMap<>();
        pointer.put("recordId", recordId);
        pointer.put("sessionId", sessionId);
        pointer.put("ranking", ranking);
        List<Object> result = new ArrayList<>(Math.min(history.size() + 1, CAP));
        result.add(pointer);
        for (Object entry : history) {
            if (result.size() >= CAP) {
                break;
            }
            result.add(entry);
        }
        return result;
    }
}

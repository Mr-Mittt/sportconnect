package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.List;

/**
 * SESSION-53 (compact form, owner 2026-11-25): the history of a statistics blob, a flat list of strings
 * {@code "<ranking>-<recordId>"} ({@code ranking} is {@code 1} when the game counted as a ranking game, else {@code 0}), newest
 * first, capped at {@value #CAP}: {@code ["0-9031", "1-9027"]}. The entry carries no game detail and no session id: a page of
 * history reads the games by id from {@code session_records}, whose row names the session. What a session counted is kept
 * once, uncapped, in its job row, so a rebuild never depends on this list. The same entry format is used for the counted
 * records of a job's result ({@link #entry}). The one place that knows the format is this class.
 */
public final class StatsHistory {

    static final int CAP = 500;

    /** One entry, read back (SESSION-73): the record and whether it counted as a ranking game. */
    public record Pointer(long recordId, boolean ranking) {
    }

    private StatsHistory() {
    }

    /** The stored form of one entry: {@code "1-9027"} for a ranking game, {@code "0-9031"} for a normal one. */
    public static String entry(long recordId, boolean ranking) {
        return (ranking ? "1-" : "0-") + recordId;
    }

    /** The entry a stored value is, or {@code null} when it is not one (anything but {@code "0-<digits>"} or {@code "1-<digits>"}). */
    static Pointer parse(Object value) {
        if (!(value instanceof String text) || text.length() < 3 || text.charAt(1) != '-'
                || (text.charAt(0) != '0' && text.charAt(0) != '1')) {
            return null;
        }
        try {
            return new Pointer(Long.parseLong(text.substring(2)), text.charAt(0) == '1');
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** The entries of a stored history, in stored order (newest first); a value that is not an entry is skipped. */
    static List<Pointer> read(List<Object> history) {
        List<Pointer> pointers = new ArrayList<>(history.size());
        for (Object value : history) {
            Pointer pointer = parse(value);
            if (pointer != null) {
                pointers.add(pointer);
            }
        }
        return pointers;
    }

    /** Whether the history already points at the record (the second line of defence against counting a game twice). */
    static boolean contains(List<Object> history, long recordId) {
        for (Object value : history) {
            Pointer pointer = parse(value);
            if (pointer != null && pointer.recordId() == recordId) {
                return true;
            }
        }
        return false;
    }

    /** A new history list with the entry first and the oldest entries cut off beyond the cap. */
    static List<Object> prepend(List<Object> history, long recordId, boolean ranking) {
        List<Object> result = new ArrayList<>(Math.min(history.size() + 1, CAP));
        result.add(entry(recordId, ranking));
        for (Object value : history) {
            if (result.size() >= CAP) {
                break;
            }
            result.add(value);
        }
        return result;
    }
}

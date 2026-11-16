package com.sportconnect.user.repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SESSION-GL-64 — the app's one user name-search rule, as a SQL predicate. Every caller (the global "find a person"
 * search, the people of a session thread, later a group-member or friend search) builds its query from this class and
 * only adds its own scope (an id list, "not me", ...), so the matching never drifts between searches.
 *
 * <p>The rule: only {@code first_name} and {@code last_name} are searched (never username, email or phone); matching is
 * word-start (the typed word is the beginning of a name, or of a later word of it, never the middle of a word) and
 * ignores case and accents ("tuan" finds "Tuấn", "dang" finds "Đặng"); a query of several words needs every word to
 * match (in any order). A user with neither a first nor a last name is never a result.
 *
 * <p>Both sides are folded by SQL itself, with {@code immutable_unaccent(lower(x))}: the same expression the V090 trigram
 * indexes are built on, so the planner can use them. The query words are only bound parameters here, never concatenated
 * into the SQL text, and {@code % _ \} inside them are escaped so a typed "%" is a percent sign, not a wildcard.
 */
public final class UserNameSearch {

    /** Words beyond this many are ignored (a name has few; the cap bounds the SQL a caller can make us build). */
    public static final int MAX_WORDS = 5;

    /** A longer word is cut to this many characters. */
    public static final int MAX_WORD_LENGTH = 30;

    private static final String FIRST = "immutable_unaccent(lower(u.first_name))";
    private static final String LAST = "immutable_unaccent(lower(u.last_name))";

    private UserNameSearch() {
    }

    /**
     * The WHERE fragment and its parameters for one typed query.
     *
     * @param where   SQL that can follow {@code WHERE ... AND}; never empty
     * @param params  named parameters of {@code where} (the escaped query words)
     * @param first   SQL expression that is 0 when the first query word begins a name, 1 otherwise; {@code null} when the
     *                query has no words (no relevance order then)
     */
    public record Predicate(String where, Map<String, Object> params, String first) {
    }

    /** The query split into at most {@link #MAX_WORDS} words of at most {@link #MAX_WORD_LENGTH} characters. */
    public static List<String> words(String query) {
        List<String> words = new ArrayList<>();
        if (query == null) {
            return words;
        }
        for (String raw : query.trim().split("\\s+")) {
            if (raw.isEmpty()) {
                continue;
            }
            words.add(raw.length() > MAX_WORD_LENGTH ? raw.substring(0, MAX_WORD_LENGTH) : raw);
            if (words.size() == MAX_WORDS) {
                break;
            }
        }
        return words;
    }

    /** Escapes the LIKE wildcards of a typed word (the SQL names backslash as the escape character). */
    static String escapeLike(String word) {
        return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /**
     * Builds the predicate for {@code query} ({@code null} or blank: every user with a name matches).
     * Parameters are named {@code w0}, {@code w1}, ...
     */
    public static Predicate predicate(String query) {
        StringBuilder where = new StringBuilder("(u.first_name IS NOT NULL OR u.last_name IS NOT NULL)");
        Map<String, Object> params = new LinkedHashMap<>();
        List<String> words = words(query);
        for (int i = 0; i < words.size(); i++) {
            String name = "w" + i;
            params.put(name, escapeLike(words.get(i)));
            where.append(" AND (")
                    .append(startsWord(FIRST, name)).append(" OR ").append(startsWord(LAST, name))
                    .append(")");
        }
        String first = words.isEmpty()
                ? null
                : "CASE WHEN " + startsField(FIRST, "w0") + " OR " + startsField(LAST, "w0") + " THEN 0 ELSE 1 END";
        return new Predicate(where.toString(), params, first);
    }

    /** The name field begins with the word. */
    private static String startsField(String field, String param) {
        return field + " LIKE immutable_unaccent(lower(:" + param + ")) || '%' ESCAPE '\\'";
    }

    /** The name field begins with the word, or a later word of it does. */
    private static String startsWord(String field, String param) {
        return "(" + startsField(field, param)
                + " OR " + field + " LIKE '% ' || immutable_unaccent(lower(:" + param + ")) || '%' ESCAPE '\\')";
    }
}

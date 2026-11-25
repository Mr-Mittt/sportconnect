package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The derived columns of a sport's statistics (SESSION-53): a formula of exactly two operands and one of {@code + - * /},
 * for example {@code wins/games} or {@code scoreFor-scoreAgainst}. The first operand is a key; the second is a key or a
 * plain number. Nothing derived is stored: the leaderboard sort values are computed from the counters when a row is
 * written, and the read API (SESSION-73) computes the displayed columns the same way.
 */
public final class StatsFormulas {

    private static final Pattern FORMULA = Pattern.compile(
            "^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*([+\\-*/])\\s*([A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\\.[0-9]+)?)\\s*$");

    private StatsFormulas() {
    }

    /** Whether the text is a formula this class can evaluate (so a bad schema entry can be dropped on read). */
    public static boolean isValid(String formula) {
        return formula != null && FORMULA.matcher(formula).matches();
    }

    /** The keys a formula reads (a plain number is not a key); empty for a formula that is not valid. */
    public static List<String> operands(String formula) {
        if (formula == null) {
            return List.of();
        }
        Matcher matcher = FORMULA.matcher(formula);
        if (!matcher.matches()) {
            return List.of();
        }
        List<String> keys = new ArrayList<>();
        keys.add(matcher.group(1));
        String right = matcher.group(3);
        if (!Character.isDigit(right.charAt(0))) {
            keys.add(right);
        }
        return keys;
    }

    /**
     * @param operand a key's value, or {@code null} when the key has no value (it then makes the whole formula empty)
     * @return the result, or {@code null} when the formula is not valid, an operand has no value, or it divides by zero
     */
    public static Double evaluate(String formula, Function<String, Double> operand) {
        if (formula == null) {
            return null;
        }
        Matcher matcher = FORMULA.matcher(formula);
        if (!matcher.matches()) {
            return null;
        }
        Double left = operand.apply(matcher.group(1));
        String rightText = matcher.group(3);
        Double right = Character.isDigit(rightText.charAt(0)) ? Double.valueOf(rightText) : operand.apply(rightText);
        if (left == null || right == null) {
            return null;
        }
        return switch (matcher.group(2)) {
            case "+" -> left + right;
            case "-" -> left - right;
            case "*" -> left * right;
            default -> right == 0d ? null : left / right;
        };
    }
}

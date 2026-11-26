package com.sportconnect.session.ranking;

import java.math.BigDecimal;
import java.util.Arrays;

/**
 * SESSION-54: the values of a board's sort keys for one subject (a player, or a pair), in the order of the board's
 * {@link SortList}. Every value is rounded to 4 decimals so that two equal values are one key (a win rate of 2/3 computed
 * twice is the same number), and {@code NaN} means "no value" (the key has nothing for this subject). It is the path of the
 * subject in a {@link BoardTree}.
 */
public final class SortTuple {

    private final double[] values;

    private SortTuple(double[] values) {
        this.values = values;
    }

    /** Builds a tuple from raw key values, rounding each to 4 decimals; a non-finite value becomes "no value". */
    public static SortTuple of(double[] raw) {
        double[] rounded = new double[raw.length];
        for (int i = 0; i < raw.length; i++) {
            rounded[i] = round(raw[i]);
        }
        return new SortTuple(rounded);
    }

    static double round(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return Double.NaN;
        }
        double rounded = Math.rint(value * 10000d) / 10000d;
        return rounded == 0d ? 0d : rounded;       // never -0.0, which would be a different key from 0.0
    }

    public int size() {
        return values.length;
    }

    /** The value of the {@code index}-th key, {@code NaN} when it has none. */
    public double get(int index) {
        return values[index];
    }

    /** The value of the {@code index}-th key as the board stores it: a plain decimal, or {@code n} for no value. */
    String key(int index) {
        double value = values[index];
        return Double.isNaN(value) ? "n" : BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    /** Reads the keys a stored board holds ({@link #key}). */
    static SortTuple parse(String[] keys) {
        double[] parsed = new double[keys.length];
        for (int i = 0; i < keys.length; i++) {
            parsed[i] = keys[i].equals("n") ? Double.NaN : Double.parseDouble(keys[i]);
        }
        return new SortTuple(parsed);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof SortTuple tuple && Arrays.equals(values, tuple.values);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(values);
    }

    @Override
    public String toString() {
        return Arrays.toString(values);
    }
}

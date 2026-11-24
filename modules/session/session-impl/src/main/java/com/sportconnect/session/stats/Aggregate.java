package com.sportconnect.session.stats;

/** How a metric of a sport's statistics combines one more game into its running value (SESSION-53). */
public enum Aggregate {
    SUM, MAX, MIN;

    /** The running value after one more game. */
    public double combine(double current, double next) {
        return switch (this) {
            case SUM -> current + next;
            case MAX -> Math.max(current, next);
            case MIN -> Math.min(current, next);
        };
    }

    /** The aggregate named in a schema, or {@code null} when the name is not one of the three. */
    public static Aggregate parse(Object name) {
        if (name instanceof String text) {
            for (Aggregate aggregate : values()) {
                if (aggregate.name().equalsIgnoreCase(text.trim())) {
                    return aggregate;
                }
            }
        }
        return null;
    }
}

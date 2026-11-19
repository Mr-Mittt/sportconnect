package com.sportconnect.session.api.dto;

/**
 * SESSION-GROUP-4 — how a group's regular sessions repeat. {@code WEEKLY}: a recurrence's {@code dayKey} is a weekday, 1 (Monday)
 * to 7 (Sunday). {@code MONTHLY}: it is a day of the month, 1 to 31 (a month without that day is skipped, SESSION-GROUP-5).
 * A group has one active mode at a time; recurrences of the other mode stay stored and are inert until the mode is switched back.
 */
public enum RecurrenceMode {
    WEEKLY(1, 7),
    MONTHLY(1, 31);

    private final int minDay;
    private final int maxDay;

    RecurrenceMode(int minDay, int maxDay) {
        this.minDay = minDay;
        this.maxDay = maxDay;
    }

    public boolean isValidDay(Integer dayKey) {
        return dayKey != null && dayKey >= minDay && dayKey <= maxDay;
    }

    public int maxDay() {
        return maxDay;
    }
}

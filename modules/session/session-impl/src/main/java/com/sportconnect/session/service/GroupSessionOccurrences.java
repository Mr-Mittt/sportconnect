package com.sportconnect.session.service;

import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.entity.GroupSessionRecurrence;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;

/**
 * SESSION-GROUP-5 — when a recurrence configuration next happens. A configuration is a wall-clock slot (a day and a local
 * start time) read in the location's timezone (owner, 2026-11-19): "today", "the nearest day" and "already ended" are all
 * judged on that wall clock, and the result is a real UTC instant. Pure functions, no clock of their own: the caller passes
 * {@code now}.
 */
final class GroupSessionOccurrences {

    private GroupSessionOccurrences() {
    }

    /** One slot: its local date and the instants it starts and ends (end = start for a recurrence with no duration). */
    record Occurrence(LocalDate date, Instant start, Instant end) {
    }

    /**
     * The first date on or after {@code from} that the recurrence falls on: the weekday for {@code WEEKLY} (1 = Monday), the
     * day of the month for {@code MONTHLY}. A month that has no such day (29, 30 or 31 in a short month) is skipped (owner,
     * 2026-11-19), never clamped to its last day.
     */
    static LocalDate firstDateOnOrAfter(RecurrenceMode mode, int dayKey, LocalDate from) {
        if (mode == RecurrenceMode.WEEKLY) {
            return from.with(TemporalAdjusters.nextOrSame(DayOfWeek.of(dayKey)));
        }
        YearMonth month = YearMonth.from(from);
        // 31 appears at least every second month, so a few months always suffice; 24 is a generous bound.
        for (int i = 0; i < 24; i++) {
            if (dayKey <= month.lengthOfMonth()) {
                LocalDate candidate = month.atDay(dayKey);
                if (!candidate.isBefore(from)) {
                    return candidate;
                }
            }
            month = month.plusMonths(1);
        }
        throw new IllegalStateException("No month with day " + dayKey + " found after " + from);
    }

    /**
     * Whether {@code date} is a day the recurrence falls on (the weekday for {@code WEEKLY}, the day of the month for
     * {@code MONTHLY}, a month without that day never). A queued slot whose date fails this was queued under an older rule.
     */
    static boolean fallsOnRule(GroupSessionRecurrence recurrence, LocalDate date) {
        return firstDateOnOrAfter(recurrence.getMode(), recurrence.getDayKey(), date).equals(date);
    }

    /** The slot of the recurrence on {@code date}, in {@code zone}. */
    static Occurrence at(GroupSessionRecurrence recurrence, ZoneId zone, LocalDate date) {
        Instant start = LocalDateTime.of(date, recurrence.getStartTime()).atZone(zone).toInstant();
        Instant end = recurrence.getDurationMinutes() != null ? start.plusSeconds(recurrence.getDurationMinutes() * 60L) : start;
        return new Occurrence(date, start, end);
    }

    /**
     * The first slot that has not ended yet at {@code now}: today's if it is still ahead or under way, otherwise the next one.
     * "Today" is the date in {@code zone}.
     */
    static Occurrence next(GroupSessionRecurrence recurrence, ZoneId zone, Instant now) {
        LocalDate from = LocalDate.ofInstant(now, zone);
        // A slot that ended earlier today rolls on to the next date, so this loop runs at most twice.
        for (int i = 0; i < 40; i++) {
            LocalDate date = firstDateOnOrAfter(recurrence.getMode(), recurrence.getDayKey(), from);
            Occurrence occurrence = at(recurrence, zone, date);
            if (occurrence.end().isAfter(now)) {
                return occurrence;
            }
            from = date.plusDays(1);
        }
        throw new IllegalStateException("No upcoming occurrence for recurrence " + recurrence.getId());
    }
}

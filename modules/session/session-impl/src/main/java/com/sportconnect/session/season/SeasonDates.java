package com.sportconnect.session.season;

import com.sportconnect.common.exception.BadRequestException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * SESSION-55: the pure date rules of a season. Every date is a <b>local</b> date in the season's own timezone (a snapshot of the
 * group's), so these functions take the zone and never read a clock themselves: the service passes "today".
 */
public final class SeasonDates {

    /** The longest a season can be, counting both its first and its last day (owner, 2026-11-27: 31 days). */
    public static final int MAX_DAYS = 31;

    private SeasonDates() {
    }

    /** The number of days a season covers, both ends included. */
    public static long days(LocalDate start, LocalDate end) {
        return ChronoUnit.DAYS.between(start, end) + 1;
    }

    /**
     * Checks a new or edited season's dates: the end is not before the start ({@code SESSION_SEASON_DATES_INVALID}), the start is
     * today or later ({@code SESSION_SEASON_START_IN_PAST}) and it lasts at most {@link #MAX_DAYS} days ({@code SESSION_SEASON_TOO_LONG}).
     */
    public static void validate(LocalDate start, LocalDate end, LocalDate today) {
        if (start == null || end == null || end.isBefore(start)) {
            throw new BadRequestException("SESSION_SEASON_DATES_INVALID", "A season needs a start date and an end date that is not before it", null);
        }
        if (start.isBefore(today)) {
            throw new BadRequestException("SESSION_SEASON_START_IN_PAST", "A season cannot start before today",
                    Map.of("today", today.toString()));
        }
        if (days(start, end) > MAX_DAYS) {
            throw new BadRequestException("SESSION_SEASON_TOO_LONG", "A season lasts at most " + MAX_DAYS + " days",
                    Map.of("maxDays", MAX_DAYS));
        }
    }

    /** Whether two seasons share a day. The end day is occupied: the next season starts the day after it (owner, 2026-11-27). */
    public static boolean overlaps(LocalDate startA, LocalDate endA, LocalDate startB, LocalDate endB) {
        return !startA.isAfter(endB) && !startB.isAfter(endA);
    }

    /** Whether a local date lies within the season's dates, both ends included. */
    public static boolean contains(LocalDate start, LocalDate end, LocalDate date) {
        return !date.isBefore(start) && !date.isAfter(end);
    }

    /** A session's local date: its start instant read in the season's timezone (owner, 2026-11-28: the season's, never the venue's). */
    public static LocalDate localDate(Instant instant, ZoneId zone) {
        return instant.atZone(zone).toLocalDate();
    }

    /** The instant the season has ended: the start of the day after its end date in its timezone. */
    public static Instant endsAt(LocalDate end, ZoneId zone) {
        return end.plusDays(1).atStartOfDay(zone).toInstant();
    }

    /** The instant a COMPLETED season is finalised on its own: its end plus the guard in which players can still log and confirm games. */
    public static Instant finalisesAt(LocalDate end, ZoneId zone, long guardHours) {
        return endsAt(end, zone).plus(Duration.ofHours(guardHours));
    }
}

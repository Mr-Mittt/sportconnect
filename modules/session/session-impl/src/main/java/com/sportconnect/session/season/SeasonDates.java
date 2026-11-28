package com.sportconnect.session.season;

import com.sportconnect.common.exception.BadRequestException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * SESSION-55: the pure date rules of a season. A season is the half-open range {@code [startAt, endAt)} of UTC instants (owner,
 * 2026-11-28): the owner picks <b>dates</b>, and the server turns them into the start of the first day and the start of the day after the
 * last, read in the group's timezone <i>at that moment</i>. After that no timezone is needed: eligibility, overlap, the job's transitions and
 * the engine's lookup are plain instant comparisons. Functions take the zone or the clock's "today" and never read a clock themselves.
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

    /** The first instant of a season starting on this date: the start of that day in the zone. */
    public static Instant startAt(LocalDate startDate, ZoneId zone) {
        return startDate.atStartOfDay(zone).toInstant();
    }

    /** The exclusive end of a season ending on this date: the start of the <b>next</b> day in the zone, so no instant of the last day falls in a gap. */
    public static Instant endAt(LocalDate endDate, ZoneId zone) {
        return endDate.plusDays(1).atStartOfDay(zone).toInstant();
    }

    /** The first date of a season, read in the zone (the group's current one: the instants are fixed, only how they are shown follows the zone). */
    public static LocalDate startDate(Instant startAt, ZoneId zone) {
        return startAt.atZone(zone).toLocalDate();
    }

    /** The last date of a season, read in the zone: the date of the last instant before the exclusive end. */
    public static LocalDate endDate(Instant endAt, ZoneId zone) {
        return endAt.minusMillis(1).atZone(zone).toLocalDate();
    }

    /** Whether two ranges share an instant. Ranges are half-open, so one season's end is the next one's earliest start. */
    public static boolean overlaps(Instant startA, Instant endA, Instant startB, Instant endB) {
        return startA.isBefore(endB) && startB.isBefore(endA);
    }

    /** Whether an instant lies within {@code [startAt, endAt)}. */
    public static boolean contains(Instant startAt, Instant endAt, Instant instant) {
        return !instant.isBefore(startAt) && instant.isBefore(endAt);
    }

    /** The instant a COMPLETED season is finalised on its own: its end plus the guard in which players can still log and confirm games. */
    public static Instant finalisesAt(Instant endAt, long guardHours) {
        return endAt.plus(Duration.ofHours(guardHours));
    }
}

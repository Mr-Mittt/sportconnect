package com.sportconnect.session.season

import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification
import spock.lang.Unroll

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** SESSION-55: the pure date rules of a season (local dates in the season's own timezone). */
class SeasonDatesSpec extends Specification {

    def today = LocalDate.of(2026, 12, 1)

    @Unroll
    def "validate accepts #label"() {
        when:
        SeasonDates.validate(start, end, today)

        then:
        noExceptionThrown()

        where:
        label                       | start                       | end
        "a season starting today"   | LocalDate.of(2026, 12, 1)   | LocalDate.of(2026, 12, 10)
        "a one-day season"          | LocalDate.of(2026, 12, 5)   | LocalDate.of(2026, 12, 5)
        "exactly 31 days"           | LocalDate.of(2026, 12, 1)   | LocalDate.of(2026, 12, 31)
    }

    @Unroll
    def "validate refuses #label with #code"() {
        when:
        SeasonDates.validate(start, end, today)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == code

        where:
        label                    | start                     | end                        | code
        "an end before the start"| LocalDate.of(2026, 12, 5) | LocalDate.of(2026, 12, 4)  | "SESSION_SEASON_DATES_INVALID"
        "a missing end"          | LocalDate.of(2026, 12, 5) | null                       | "SESSION_SEASON_DATES_INVALID"
        "a start before today"   | LocalDate.of(2026, 11, 30)| LocalDate.of(2026, 12, 5)  | "SESSION_SEASON_START_IN_PAST"
        "32 days"                | LocalDate.of(2026, 12, 1) | LocalDate.of(2027, 1, 1)   | "SESSION_SEASON_TOO_LONG"
    }

    def "a season of 31 days counts both ends and 32 does not fit"() {
        expect:
        SeasonDates.days(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 31)) == 31
        SeasonDates.days(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 1)) == 1
    }

    def "the end day is occupied: the next season starts the day after"() {
        expect:
        SeasonDates.overlaps(d(1), d(10), d(10), d(20))
        !SeasonDates.overlaps(d(1), d(10), d(11), d(20))
        SeasonDates.overlaps(d(5), d(8), d(1), d(31))
        !SeasonDates.overlaps(d(11), d(20), d(1), d(10))
    }

    def "contains includes both ends"() {
        expect:
        SeasonDates.contains(d(1), d(10), d(1))
        SeasonDates.contains(d(1), d(10), d(10))
        !SeasonDates.contains(d(1), d(10), d(11))
        !SeasonDates.contains(d(2), d(10), d(1))
    }

    def "a session's local date is read in the season's timezone, not UTC and not the venue's"() {
        given: "17:30 UTC is 00:30 the next day in Ho Chi Minh City and 12:30 the same day in New York"
        def instant = Instant.parse("2026-12-01T17:30:00Z")

        expect:
        SeasonDates.localDate(instant, ZoneId.of("Asia/Ho_Chi_Minh")) == LocalDate.of(2026, 12, 2)
        SeasonDates.localDate(instant, ZoneId.of("America/New_York")) == LocalDate.of(2026, 12, 1)
    }

    def "the season ends at the start of the day after its end date in its zone, and finalises a guard later"() {
        given:
        def zone = ZoneId.of("Asia/Ho_Chi_Minh")

        expect:
        SeasonDates.endsAt(d(10), zone) == Instant.parse("2026-12-10T17:00:00Z")
        SeasonDates.finalisesAt(d(10), zone, 24) == Instant.parse("2026-12-11T17:00:00Z")
    }

    private static LocalDate d(int day) {
        LocalDate.of(2026, 12, day)
    }
}

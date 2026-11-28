package com.sportconnect.session.season

import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification
import spock.lang.Unroll

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * SESSION-55: the pure date rules of a season. The owner picks dates; the season is the half-open range [startAt, endAt) of UTC instants,
 * the start of the first day to the start of the day after the last, in the group's timezone at the moment of saving.
 */
class SeasonDatesSpec extends Specification {

    def today = LocalDate.of(2026, 12, 1)
    def vn = ZoneId.of("Asia/Ho_Chi_Minh")

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

    def "a season of 31 days counts both ends"() {
        expect:
        SeasonDates.days(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 31)) == 31
        SeasonDates.days(LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 1)) == 1
    }

    def "the range runs from the start of the first day to the start of the day after the last, in the group's zone"() {
        expect:
        SeasonDates.startAt(d(1), vn) == Instant.parse("2026-11-30T17:00:00Z")
        SeasonDates.endAt(d(10), vn) == Instant.parse("2026-12-10T17:00:00Z")
        SeasonDates.endAt(d(1), vn) == SeasonDates.startAt(d(2), vn)
    }

    def "the dates read back from the instants in the zone, the last date being the day before the exclusive end"() {
        given:
        def startAt = SeasonDates.startAt(d(1), vn)
        def endAt = SeasonDates.endAt(d(10), vn)

        expect:
        SeasonDates.startDate(startAt, vn) == d(1)
        SeasonDates.endDate(endAt, vn) == d(10)
        and: "a one-day season reads as one date at both ends"
        SeasonDates.endDate(SeasonDates.endAt(d(5), vn), vn) == d(5)
    }

    def "a region change moves how the dates read, never the instants"() {
        given:
        def startAt = SeasonDates.startAt(d(1), vn)
        def tokyo = ZoneId.of("Asia/Tokyo")

        expect: "00:00 in Ho Chi Minh City is 02:00 in Tokyo, still the first of December"
        SeasonDates.startDate(startAt, tokyo) == d(1)
        and: "while 00:00 in Ho Chi Minh City read in Los Angeles is the previous day"
        SeasonDates.startDate(startAt, ZoneId.of("America/Los_Angeles")) == LocalDate.of(2026, 11, 30)
    }

    def "ranges are half-open: the next season may start at the very instant the last one ends, and nothing else touches"() {
        given:
        def a = [SeasonDates.startAt(d(1), vn), SeasonDates.endAt(d(10), vn)]
        def next = [SeasonDates.startAt(d(11), vn), SeasonDates.endAt(d(20), vn)]
        def sameDay = [SeasonDates.startAt(d(10), vn), SeasonDates.endAt(d(15), vn)]
        def inside = [SeasonDates.startAt(d(3), vn), SeasonDates.endAt(d(4), vn)]

        expect:
        !SeasonDates.overlaps(a[0], a[1], next[0], next[1])
        !SeasonDates.overlaps(next[0], next[1], a[0], a[1])
        SeasonDates.overlaps(a[0], a[1], sameDay[0], sameDay[1])
        SeasonDates.overlaps(a[0], a[1], inside[0], inside[1])
        SeasonDates.overlaps(inside[0], inside[1], a[0], a[1])
    }

    def "contains takes the first instant and leaves the exclusive end out"() {
        given:
        def startAt = SeasonDates.startAt(d(1), vn)
        def endAt = SeasonDates.endAt(d(10), vn)

        expect:
        SeasonDates.contains(startAt, endAt, startAt)
        SeasonDates.contains(startAt, endAt, endAt.minusMillis(1))
        !SeasonDates.contains(startAt, endAt, endAt)
        !SeasonDates.contains(startAt, endAt, startAt.minusMillis(1))
    }

    def "a session at 23:59:59.5 on the last day is inside, which a 23:59:59 end would have left out"() {
        given:
        def startAt = SeasonDates.startAt(d(1), vn)
        def endAt = SeasonDates.endAt(d(10), vn)
        def lateSession = ZonedLocal(d(10), "23:59:59.500")

        expect:
        SeasonDates.contains(startAt, endAt, lateSession)
    }

    def "a COMPLETED season finalises a guard after its end"() {
        expect:
        SeasonDates.finalisesAt(SeasonDates.endAt(d(10), vn), 24) == Instant.parse("2026-12-11T17:00:00Z")
    }

    private Instant ZonedLocal(LocalDate date, String time) {
        java.time.ZonedDateTime.of(date, java.time.LocalTime.parse(time), vn).toInstant()
    }

    private static LocalDate d(int day) {
        LocalDate.of(2026, 12, day)
    }
}

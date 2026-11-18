package com.sportconnect.session.service

import com.sportconnect.session.api.dto.RecurrenceMode
import com.sportconnect.session.entity.GroupSessionRecurrence
import spock.lang.Specification

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * SESSION-GROUP-5: when a recurrence next happens. Wall-clock slots in the location's timezone (owner, 2026-11-19), a month
 * without the day skipped, a slot that has ended rolling on.
 */
class GroupSessionOccurrencesSpec extends Specification {

    static final ZoneId HCM = ZoneId.of("Asia/Ho_Chi_Minh")   // UTC+7, no DST
    static final ZoneId UTC = ZoneOffset.UTC

    private static GroupSessionRecurrence weekly(int day, String start = "18:00", Integer minutes = 90) {
        GroupSessionRecurrence.builder().id(1L).mode(RecurrenceMode.WEEKLY).dayKey(day).startTime(LocalTime.parse(start))
                .durationMinutes(minutes).build()
    }

    private static GroupSessionRecurrence monthly(int day, String start = "18:00", Integer minutes = 90) {
        GroupSessionRecurrence.builder().id(2L).mode(RecurrenceMode.MONTHLY).dayKey(day).startTime(LocalTime.parse(start))
                .durationMinutes(minutes).build()
    }

    // 2026-11-18 is a Wednesday (ISO 3).

    def "weekly: the first date on or after the given one that falls on the weekday"() {
        expect:
        GroupSessionOccurrences.firstDateOnOrAfter(RecurrenceMode.WEEKLY, day, LocalDate.of(2026, 11, 18)) == LocalDate.parse(expected)

        where:
        day | expected
        3   | "2026-11-18"   // today itself
        4   | "2026-11-19"
        2   | "2026-11-24"   // already passed this week: next Tuesday
        1   | "2026-11-23"
        7   | "2026-11-22"
    }

    def "monthly: the day of the month, a month without that day is skipped, never clamped"() {
        expect:
        GroupSessionOccurrences.firstDateOnOrAfter(RecurrenceMode.MONTHLY, day, LocalDate.parse(from)) == LocalDate.parse(expected)

        where:
        day | from         | expected
        15  | "2026-11-10" | "2026-11-15"
        15  | "2026-11-15" | "2026-11-15"
        15  | "2026-11-16" | "2026-12-15"
        31  | "2026-11-10" | "2026-12-31"   // November has 30 days: skipped
        31  | "2026-01-31" | "2026-01-31"
        31  | "2026-02-01" | "2026-03-31"   // February skipped
        31  | "2026-04-01" | "2026-05-31"   // April skipped
        30  | "2026-02-01" | "2026-03-30"
        29  | "2027-02-01" | "2027-03-29"   // not a leap year
        29  | "2028-02-01" | "2028-02-29"   // a leap year
        1   | "2026-12-31" | "2027-01-01"
    }

    def "a slot is the date and local start time read in the zone, as a UTC instant, ending after the duration"() {
        when:
        def slot = GroupSessionOccurrences.at(weekly(3, "07:30", 60), HCM, LocalDate.of(2026, 11, 18))

        then:
        slot.date() == LocalDate.of(2026, 11, 18)
        slot.start() == Instant.parse("2026-11-18T00:30:00Z")   // 07:30 in UTC+7
        slot.end() == Instant.parse("2026-11-18T01:30:00Z")
    }

    def "a recurrence with no duration ends where it starts"() {
        expect:
        def slot = GroupSessionOccurrences.at(weekly(3, "10:00", null), UTC, LocalDate.of(2026, 11, 18))
        slot.start() == slot.end()
    }

    def "next: today's slot while it is still ahead or under way, otherwise the next date; judged on the zone's wall clock"() {
        expect:
        GroupSessionOccurrences.next(weekly(3, "18:00", 90), UTC, Instant.parse(now)).date() == LocalDate.parse(expected)

        where:
        now                      | expected
        "2026-11-18T10:00:00Z"   | "2026-11-18"   // ahead
        "2026-11-18T18:30:00Z"   | "2026-11-18"   // under way (ends 19:30)
        "2026-11-18T19:29:59Z"   | "2026-11-18"   // one second before the end
        "2026-11-18T19:30:00Z"   | "2026-11-25"   // ended exactly now: a slot that has ended is over
        "2026-11-18T23:00:00Z"   | "2026-11-25"
    }

    def "next reads 'today' on the zone's wall clock, not UTC's"() {
        // 2026-11-17T23:00Z is already Wednesday 06:00 in Ho Chi Minh: Wednesday's 07:00 slot is today's, still ahead.
        expect:
        GroupSessionOccurrences.next(weekly(3, "07:00", 60), HCM, Instant.parse("2026-11-17T23:00:00Z")).date() == LocalDate.of(2026, 11, 18)
        // The same instant in UTC is still Tuesday: Wednesday is tomorrow.
        GroupSessionOccurrences.next(weekly(3, "07:00", 60), UTC, Instant.parse("2026-11-17T23:00:00Z")).date() == LocalDate.of(2026, 11, 18)
        // Late Wednesday evening in Ho Chi Minh is still Wednesday there (16:00Z = 23:00 local): the 07:00 slot has ended.
        GroupSessionOccurrences.next(weekly(3, "07:00", 60), HCM, Instant.parse("2026-11-18T16:00:00Z")).date() == LocalDate.of(2026, 11, 25)
    }

    def "next for a monthly recurrence: this month's day while it is ahead, otherwise the next month that has it"() {
        expect:
        GroupSessionOccurrences.next(monthly(day), UTC, Instant.parse(now)).date() == LocalDate.parse(expected)

        where:
        day | now                      | expected
        20  | "2026-11-18T10:00:00Z"   | "2026-11-20"
        18  | "2026-11-18T10:00:00Z"   | "2026-11-18"
        18  | "2026-11-18T20:00:00Z"   | "2026-12-18"
        31  | "2026-11-18T10:00:00Z"   | "2026-12-31"
        31  | "2026-12-31T20:00:00Z"   | "2027-01-31"   // Dec 31 has ended; January has a 31st
    }
}

package com.sportconnect.session.api.dto;

/**
 * SESSION-25 — direction for {@code /discover}'s optional {@code startTime} filter, which compares
 * only the time-of-day component of {@code Session.scheduledStart} against the given
 * {@code LocalTime}, independent of the calendar date. Always supplied together with
 * {@code startTime} — one without the other is a BadRequestException.
 */
public enum StartTimeFilter {
    BEFORE_OR_EQUAL,
    AFTER_OR_EQUAL
}

package com.sportconnect.session.api.dto;

/**
 * SESSION-55: where a group season is in its life. Each value means one thing.
 * <ul>
 *   <li>{@code SCHEDULED} - before its start date (local, in the season's timezone); fully editable.</li>
 *   <li>{@code ONGOING} - from the start date; counting. Only the links of a MANUAL season change.</li>
 *   <li>{@code COMPLETED} - after the end date, inside the guard window in which late games can still be logged; links still change.</li>
 *   <li>{@code FINALISED} - final: stats and board frozen, links locked. Never revived.</li>
 *   <li>{@code CANCELLED} - final: stopped counting, still readable. Never revived. From SCHEDULED or ONGOING.</li>
 * </ul>
 * A client-mirrored enum (CLIENT-NOTIF-4 rule).
 */
public enum SeasonStatus {
    SCHEDULED, ONGOING, COMPLETED, FINALISED, CANCELLED;

    /** A season that holds one of the group's two open places (the limit counts these). */
    public boolean isOpen() {
        return this == SCHEDULED || this == ONGOING;
    }
}

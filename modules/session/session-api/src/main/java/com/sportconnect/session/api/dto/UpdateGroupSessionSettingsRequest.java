package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SESSION-GROUP-4 — partial update of a group's regular-session settings: only a non-null field is applied. Switching
 * {@code mode} changes no recurrence row; it only changes which recurrences are active.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateGroupSessionSettingsRequest {

    /** Turn regular-session generation on or off. Omitted = unchanged. */
    private Boolean enabled;

    /** {@code WEEKLY} or {@code MONTHLY}. Omitted = unchanged. */
    private RecurrenceMode mode;

    /**
     * SESSION-78 — switch the group's member statistics and leaderboard on or off (owner or admin, like every field here).
     * Omitted = unchanged. Independent of {@code enabled}: a call that sends only this changes nothing else.
     */
    private Boolean statisticsEnabled;

    /**
     * SESSION-83 - the group's own config of the statistics it counts for its member row and board, keyed by stat
     * ({@code {"sessions": {"enabled": false, "when": ["atLeast1Game"], "combine": "OR"}}}), an object (typed {@code Object} so a wrong
     * type is our own 400 {@code NOT_AN_OBJECT}, not a parse error); only {@code sessions} is accepted
     * today. Omitted or {@code null} = unchanged, an empty object {@code {}} clears it (the sport's config applies), anything
     * not valid is 400 {@code SESSION_GROUP_STATS_CONFIG_INVALID}. A change is refused (409
     * {@code SESSION_GROUP_STATISTICS_NOT_AVAILABLE}) while the group's sport has statistics off, and disabling a stat that the
     * group's own ranking rule names is 409 {@code SESSION_GROUP_STAT_IN_USE}.
     */
    private Object statsConfig;

    /**
     * SESSION-GROUP-6 — when this call turns generation <b>off</b> or <b>switches the mode</b>, also cancel every scheduled
     * regular session of the group (the audience and the players are told). Omitted or {@code false} = "leave them there".
     * Ignored by a call that does neither.
     */
    private Boolean cancelScheduled;
}

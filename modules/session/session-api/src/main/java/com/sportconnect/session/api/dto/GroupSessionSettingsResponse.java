package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SESSION-GROUP-4 — a group's regular-session settings. {@code enabled = false} (the default, also when the group has never
 * saved any) means no regular session is generated and the client hides every recurrence below it.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSessionSettingsResponse {

    private Long groupId;
    private boolean enabled;
    private RecurrenceMode mode;
    /**
     * SESSION-78 — the group's statistics and leaderboard switch ({@code false} by default, also when the group has no row), or
     * {@code null} when the group's sport does not have statistics switched on (or the group has no sport): the setting is then
     * ignored, the client does not show it, and a change to it is refused (409 {@code SESSION_GROUP_STATISTICS_NOT_AVAILABLE}).
     */
    private Boolean statisticsEnabled;
    /** SESSION-GROUP-6 — how many scheduled regular sessions this call cancelled ({@code cancelScheduled}); 0 otherwise. */
    private int cancelledSessions;
}

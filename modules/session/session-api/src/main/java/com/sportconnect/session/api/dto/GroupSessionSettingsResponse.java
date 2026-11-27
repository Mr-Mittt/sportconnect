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
    /** SESSION-83 - the group's own stats config as stored ({@code null} when it has none and the sport's applies). */
    private java.util.Map<String, Object> statsConfig;
    /**
     * SESSION-83 - the config the group's member row really uses (the group's own over the sport's): for {@code sessions}
     * whether it is collected for the row and, when it is, the rule ({@code when}, {@code combine}). {@code null} when the group's
     * sport does not have statistics switched on.
     */
    private java.util.Map<String, Object> effectiveStatsConfig;
    /** SESSION-GROUP-6 — how many scheduled regular sessions this call cancelled ({@code cancelScheduled}); 0 otherwise. */
    private int cancelledSessions;
}

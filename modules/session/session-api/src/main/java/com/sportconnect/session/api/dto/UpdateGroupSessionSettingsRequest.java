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
     * SESSION-GROUP-6 — when this call turns generation <b>off</b> or <b>switches the mode</b>, also cancel every scheduled
     * regular session of the group (the audience and the players are told). Omitted or {@code false} = "leave them there".
     * Ignored by a call that does neither.
     */
    private Boolean cancelScheduled;
}

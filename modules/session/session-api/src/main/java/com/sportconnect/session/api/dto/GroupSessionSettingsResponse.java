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
}

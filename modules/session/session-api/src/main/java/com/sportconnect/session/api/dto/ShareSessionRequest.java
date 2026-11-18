package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * SESSION-66 — the friends a user shares a standalone session with. A share is a notification, not an invitation:
 * no participant row is written, the friend decides for themself whether to ask to join. Duplicate ids count once.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShareSessionRequest {

    /** At least one and at most {@value #MAX_RECIPIENTS} users; a recipient who is not a friend of the caller is ignored. */
    @NotEmpty(message = "userIds must not be empty")
    @Size(max = MAX_RECIPIENTS, message = "userIds must not exceed 50 entries")
    private List<@NotNull(message = "userIds must not contain null") UUID> userIds;

    public static final int MAX_RECIPIENTS = 50;
}

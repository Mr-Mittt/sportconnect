package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * U18 — the narrow shape for the very common "resolve a batch of user ids to a display name and avatar" need
 * (post/comment authors, group members and creators, session creators/cancellers/participants, notification
 * actors). A census of every {@link com.sportconnect.user.api.service.UserService#getUsersByIds} call site across
 * {@code notification-impl}, {@code session-impl}, {@code group-impl} and {@code post-impl} found none reading
 * anything beyond these two fields — this DTO is exactly that, so the field never grows unnoticed the way
 * {@code UserResponse} has (U16 added two fields to it that no display-name caller wants). No PII.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserSummaryResponse {

    private UUID id;
    private String fullName;
    private String avatarUrl;
}

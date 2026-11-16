package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * B23 - one member of a group as the tag picker lists them. Deliberately only an id, a display name and an avatar:
 * no role, email, username, phone or membership status.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupMemberSearchResultResponse {

    private UUID userId;

    /** First and last name. */
    private String fullName;

    private String avatarUrl;
}

package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * SESSION-GL-64 — one person who can see a session's discussion thread, as the tag picker lists them. Deliberately only
 * an id, a display name and an avatar: no email, username, phone or participant status.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ThreadPersonResponse {

    private UUID userId;

    /** First and last name. */
    private String fullName;

    private String avatarUrl;
}

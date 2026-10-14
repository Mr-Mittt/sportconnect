package com.sportconnect.user.api.dto;

import java.util.List;

/**
 * A25: what the per-request authentication gate needs to know about a user, and nothing else.
 *
 * @param isActive {@code false} for a deactivated account, which must not be authenticated
 * @param roles    role names without the {@code ROLE_} prefix, e.g. {@code USER}
 */
public record UserAccessState(boolean isActive, List<String> roles) {
}

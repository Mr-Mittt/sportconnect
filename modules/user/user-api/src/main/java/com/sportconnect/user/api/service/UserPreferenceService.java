package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest;
import com.sportconnect.user.api.dto.UserPreferenceResponse;

import java.util.UUID;

/**
 * User preference (app settings) service interface
 */
public interface UserPreferenceService {

    /**
     * Get a user's preferences. Creates a default row on first access.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if the user is deactivated or unknown
     *         (U16) — checked before the row is created, so a deactivated caller leaves nothing behind
     */
    UserPreferenceResponse getPreferences(UUID userId);

    /**
     * Update a user's preferences (partial update). Creates a default row first if none exists.
     *
     * <p>U16: {@code language}, when supplied, must be the code of an active reference language (it used to accept
     * any string); a deactivated caller is rejected. Both are checked before the row is created or touched.
     *
     * @throws com.sportconnect.common.exception.BadRequestException for an unknown or inactive language code
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if the user is deactivated or unknown
     */
    UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request);
}

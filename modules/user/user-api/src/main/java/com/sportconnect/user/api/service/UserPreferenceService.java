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
     */
    UserPreferenceResponse getPreferences(UUID userId);

    /**
     * Update a user's preferences (partial update). Creates a default row first if none exists.
     */
    UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request);
}

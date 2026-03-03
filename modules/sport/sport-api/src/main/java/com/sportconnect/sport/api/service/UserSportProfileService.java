package com.sportconnect.sport.api.service;

import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;

import java.util.List;
import java.util.UUID;

/**
 * User sport profile service interface
 */
public interface UserSportProfileService {

    /**
     * Create user sport profile
     */
    UserSportProfileResponse createProfile(UUID userId, CreateUserSportProfileRequest request);

    /**
     * Get user sport profile by ID
     */
    UserSportProfileResponse getProfileById(Long profileId);

    /**
     * Get all profiles for a user
     */
    List<UserSportProfileResponse> getUserProfiles(UUID userId);

    /**
     * Get user profile for specific sport
     */
    UserSportProfileResponse getUserProfileForSport(UUID userId, Long sportId);

    /**
     * Update user sport profile
     */
    UserSportProfileResponse updateProfile(Long profileId, CreateUserSportProfileRequest request);

    /**
     * Delete user sport profile
     */
    void deleteProfile(Long profileId);
}

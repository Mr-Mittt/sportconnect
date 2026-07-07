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
     * Create user sport profile. {@code request.getAttributes()} (sport-specific, schema-less data)
     * is stored as-is if present; rejected with {@code BadRequestException} if its serialized JSON
     * exceeds ~4KB.
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
     * Update user sport profile. Only the profile's owner may update it — throws
     * {@code ForbiddenException} if {@code callerId} does not match the profile's {@code userId}.
     *
     * <p>{@code request.getAttributes()}, if present, is <b>merged</b> into the existing
     * attributes map rather than replacing it wholesale — a sport-specific form only sends the
     * keys it cares about and shouldn't wipe out attributes set by a different flow. The merged
     * result is rejected with {@code BadRequestException} if its serialized JSON exceeds ~4KB.
     */
    UserSportProfileResponse updateProfile(Long profileId, UUID callerId, CreateUserSportProfileRequest request);

    /**
     * Soft-delete a user sport profile. Only the profile's owner may delete it — throws
     * {@code ForbiddenException} if {@code callerId} does not match the profile's {@code userId}.
     */
    void deleteProfile(Long profileId, UUID callerId);

    /**
     * Check if user has an active profile for a given sport
     */
    boolean hasProfileForSport(UUID userId, Long sportId);
}

package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserResponse;

import java.util.UUID;

/**
 * User service interface
 */
public interface UserService {

    /**
     * Get user by ID
     */
    UserResponse getUserById(UUID userId);

    /**
     * Get user by email
     */
    UserResponse getUserByEmail(String email);

    /**
     * Get user by username
     */
    UserResponse getUserByUsername(String username);

    /**
     * Update user profile
     */
    UserResponse updateProfile(UUID userId, UpdateProfileRequest request);

    /**
     * Soft delete user
     */
    void deleteUser(UUID userId);

    /**
     * Check if user exists by email
     */
    boolean existsByEmail(String email);

    /**
     * Check if user exists by username
     */
    boolean existsByUsername(String username);
}

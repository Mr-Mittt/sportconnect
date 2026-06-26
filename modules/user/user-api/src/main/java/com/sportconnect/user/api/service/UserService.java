package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserResponse;

import java.util.Set;
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

    /**
     * Create a new user (for registration)
     */
    UserResponse createUser(String email, String passwordHash, String firstName, String lastName, String phoneNumber);

    /**
     * Update user password (for password reset)
     */
    void updateUserPassword(UUID userId, String newPasswordHash);

    /**
     * Get user roles (for JWT token generation)
     */
    Set<String> getUserRoles(UUID userId);

    /**
     * Verify user password (for authentication)
     * Returns true if password matches, false otherwise
     */
    boolean verifyPassword(String email, String rawPassword);

    /**
     * Update user's last login timestamp
     */
    void updateLastLogin(UUID userId);
}

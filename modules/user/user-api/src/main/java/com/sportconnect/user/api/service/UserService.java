package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.dto.UserSearchResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
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
     * Batch lookup by ID. Missing/inactive ids are simply absent from the returned map —
     * no exception is thrown, mirroring a plain findAllById() semantics.
     */
    Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds);

    /**
     * Get user by email
     */
    UserResponse getUserByEmail(String email);

    /**
     * Get user by username
     */
    UserResponse getUserByUsername(String username);

    /**
     * Update user profile. Caller may only update their own profile.
     */
    UserResponse updateProfile(UUID userId, UUID callerId, UpdateProfileRequest request);

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

    /**
     * Self-service password change. Verifies currentPassword before hashing and persisting newPassword.
     */
    void changePassword(UUID userId, String currentPassword, String newPassword);

    /**
     * Search other active users by name/username, enriched with the caller's friendship status
     * toward each result. keyword is required (minimum 2 characters).
     */
    Page<UserSearchResponse> searchUsers(UUID callerId, String keyword, Pageable pageable);
}

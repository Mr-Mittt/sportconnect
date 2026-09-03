package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserInfoResponse;
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
     * U12: same "active user or not found" contract as {@link #getUserById}, but takes a shared
     * row lock ({@code PESSIMISTIC_READ}) held for the caller's whole transaction, so a concurrent
     * deactivation ({@code deleteUser}'s exclusive lock on the same row) blocks this instead of
     * racing it. Only needed on a path that decides whether to mint new credentials for the user
     * (today: {@code AuthServiceImpl.refreshToken()}) — everywhere else, the plain unlocked
     * {@link #getUserById} is correct and cheaper.
     */
    UserResponse getActiveUserForUpdate(UUID userId);

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
     * U15: the PII-free public view ({@link UserInfoResponse}) of an already-loaded user, enriched
     * with {@code activeSportIds} — the ids of the sports that user holds an <em>active</em>
     * {@code UserSportProfile} for.
     *
     * <p>Flow: one cross-domain read via {@code sport-api}'s
     * {@code UserSportProfileService.getUserProfiles(userId)} (active-only), mapped to sport ids.
     * Takes the resolved {@link UserResponse} rather than an id so the three lookup controller
     * endpoints (by id / email / username) don't pay a second user read.
     *
     * <p>Exists so a caller rendering another user's sport pills gets just the sport-id list —
     * name and icon are client-local — without the full non-owner sport-profile read that A22
     * deliberately removed. {@code activeSportIds} is never null ({@code []} when the user has no
     * active profiles); order is unspecified.
     */
    UserInfoResponse toPublicUserInfo(UserResponse user);

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

package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.ConfirmationCodeResponse;
import com.sportconnect.user.api.dto.ConfirmationPurpose;
import com.sportconnect.user.api.dto.ExternalIdentity;
import com.sportconnect.user.api.dto.ProvisionedUser;
import com.sportconnect.user.api.dto.UserAccessState;
import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserInfoResponse;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.dto.UserSearchResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.Optional;
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
     *
     * <p><strong>U16 — display names are deliberately not resolved here.</strong> Each {@link UserResponse} carries
     * {@code countryId} and {@code regionId}, but {@code country} is only the legacy free text and
     * {@code regionName} is {@code null}. This is the hot cross-domain batch call behind the feed, comments, group
     * and session lists (Discover included), none of which shows a country; resolving names here would add up to
     * two reference-domain queries to every one of them. A caller that does need names should collect the ids and
     * call {@code ReferenceService.getCountriesByIds} / {@code getRegionsByIds} once, or use a single-user read.
     */
    Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds);

    /**
     * U18 — the same batch-by-id contract as {@link #getUsersByIds} (one query, unknown/inactive ids simply
     * absent, no exception), narrowed to {@link UserSummaryResponse} ({@code id}/{@code fullName}/{@code avatarUrl}).
     * Prefer this over {@link #getUsersByIds} at any call site that only resolves a display name and avatar —
     * which is every current cross-domain caller (post/comment authors, group members, session
     * creators/participants, notification actors). No reference-domain or other cross-domain call is added by
     * using this instead — both methods cost exactly one {@code userRepository} query.
     */
    Map<UUID, UserSummaryResponse> getUserSummariesByIds(List<UUID> userIds);

    /**
     * Get an active user by email. U23: {@code email} is optional on an account, so a {@code null} or blank value
     * never matches (it is not looked up as "users with no email").
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if no active account has this email
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
     *
     * <p>Validation runs before any field is applied, so a rejected request saves nothing: the country/region
     * selection (U16, {@code 400}) and {@code gender} (U20). {@code gender} must be exactly one of
     * {@link com.sportconnect.user.api.dto.Gender}'s names ({@code MALE}, {@code FEMALE}) - anything else, including
     * lower-case, is a {@code BadRequestException}; {@code null} skips the field and the empty string clears it.
     *
     * <p>{@code phoneNumber} (U23, U25) is classified before any field is applied: {@code null} skips it, a blank value
     * clears it (and its status). A number that parses is stored as E.164 (default region VN) with status {@code VALID} and
     * checked against other accounts; re-sending the caller's own number is not a conflict, and keeps {@code VERIFIED}. One
     * that does not parse is saved <em>as typed</em> with status {@code INVALID} - never a 400 - and is not unique or an
     * identifier. Clearing the phone of an account that has no email, or replacing it with an {@code INVALID} one, is
     * refused ({@code IDENTIFIER_REQUIRED}), since the account would be left with no identifier.
     *
     * @throws com.sportconnect.common.exception.BadRequestException on an invalid gender, geo selection or physical stat,
     *         or clearing the only identifier ({@code IDENTIFIER_REQUIRED})
     * @throws com.sportconnect.common.exception.ConflictException {@code PHONE_ALREADY_USED} when another account holds the number
     * @throws com.sportconnect.common.exception.ForbiddenException if {@code callerId} is not {@code userId}
     */
    UserResponse updateProfile(UUID userId, UUID callerId, UpdateProfileRequest request);

    /**
     * Soft delete user
     */
    void deleteUser(UUID userId);

    /**
     * Self-service deactivation (U22, U24). Takes the same exclusive row lock as {@link #deleteUser}, requires the account
     * to still be active, confirms the caller with exactly one proof (their current password, asked of Keycloak, or the
     * code emailed for {@link ConfirmationPurpose#DEACTIVATE}), then deactivates exactly like {@code deleteUser}. The
     * account stays recoverable through the A26 re-activation flow.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if the account does not exist or is already deactivated
     * @throws com.sportconnect.common.exception.BadRequestException with {@code CONFIRMATION_REQUIRED} (neither or both
     *         proofs), {@code CURRENT_PASSWORD_INCORRECT}, or a {@code VERIFICATION_CODE_*} code (nothing changes)
     * @throws com.sportconnect.common.exception.TooManyRequestsException with {@code PASSWORD_ATTEMPTS_EXCEEDED}
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak or the code store is down
     */
    void deactivateOwnAccount(UUID userId, String currentPassword, String verificationCode);

    /**
     * U24: emails the caller a one-time code (6 digits, valid 15 minutes) that confirms {@code purpose} in place of the
     * current password. A new code replaces the previous one for that purpose; another request within 60 seconds is
     * refused. The text is in the caller's language (stored preference, else their country's, else English).
     *
     * @return the resend wait and the code's lifetime, in seconds
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if the account does not exist or is deactivated
     * @throws com.sportconnect.common.exception.BadRequestException with {@code VERIFICATION_EMAIL_UNAVAILABLE} when the account has no email
     * @throws com.sportconnect.common.exception.TooManyRequestsException with {@code VERIFICATION_RESEND_TOO_SOON} ({@code seconds})
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when the code store is down
     */
    ConfirmationCodeResponse sendConfirmationCode(UUID userId, ConfirmationPurpose purpose);


    /**
     * Check if user exists by email. U23: {@code false} for a {@code null} or blank value.
     */
    boolean existsByEmail(String email);

    /**
     * The language to write to this user in when no UI is involved (A10: the password-reset email), as an
     * <em>active</em> reference language code. Includes deactivated users; returns only a code, no profile data.
     *
     * <p>Order: the user's stored {@code UserPreference.language} when it is an active language; otherwise the
     * default language of the user's country ({@code countries.default_language_code}) when that is active.
     * Empty when neither applies (no preference row and no country or default, or the stored languages were
     * deactivated), leaving the caller to pick its own fallback. A preference row, once created, always carries a
     * language (the entity defaults it to {@code en}), so a user who has opened their preferences without choosing
     * is treated as having chosen {@code en}.
     *
     * @return an active {@code languages.code}, or empty
     */
    Optional<String> findPreferredLanguageCode(UUID userId);

    /**
     * Check if user exists by username
     */
    boolean existsByUsername(String username);

    /**
     * Get user roles (for JWT token generation)
     */
    Set<String> getUserRoles(UUID userId);

    /**
     * A26: re-activates a deactivated account by id (the Keycloak sign-in knows the subject, not an email, and a phone-only
     * account has none). An already active account is returned unchanged. Evicts the cached access state after commit, so
     * the next request sees the account as active at once.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if no such user
     */
    UserResponse reactivateUser(UUID userId);

    /**
     * A36: the first Google sign-in of an account may give it the Google picture as its avatar. Runs once per user: the
     * first call records that the check happened (whatever it decided), every later call returns the user unchanged.
     * The picture is used only when the account has no avatar yet and the URL is https on a Google image host
     * ({@code googleusercontent.com}) and fits the column; anything else is ignored, never an error.
     *
     * @param pictureUrl the token's {@code picture} claim, untrusted; may be null
     * @return the user as it is after the call (with the new avatar when one was set)
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if no such user
     */
    UserResponse applyGoogleAvatarOnce(UUID userId, String pictureUrl);

    /**
     * A26: the first-sign-in provisioning. Returns the existing account when {@code identity.id} (the Keycloak
     * {@code sub}) already has a row, otherwise creates it with {@code users.id = sub} and the default {@code USER} role.
     * An existing account is returned as it is, active or not, and is <em>not</em> re-synced from the identity: after the
     * first sign-in our database owns the profile.
     *
     * <p>On creation: the username is {@code preferred_username} (cut to 50 characters, with a {@code -<sub prefix>}
     * suffix when taken); first and last name come from the given and family names, else from splitting the full name;
     * the phone is classified like every other phone (U23, U25: one that does not parse is stored as typed with status
     * {@code INVALID}, never refused, because the Keycloak account already exists); the language becomes the preference only when it is an active
     * language; {@code is_email_verified} follows the token. There is no password hash (Keycloak holds the credential).
     *
     * <p>A32: the register page's country, region and location arrive as optional claims and are stored on the new row only,
     * each part dropped (logged, never a failure) when invalid: an unknown or inactive country drops the region too, a region
     * not in its country is dropped alone, coordinates are kept only as an in-range pair. The Keycloak account already exists
     * when they arrive, so a 400 here would strand a signed-up user.
     *
     * @return the account and whether this call created it (A28: the caller sends the welcome email once, on {@code true})
     * @throws com.sportconnect.common.exception.BadRequestException {@code IDENTIFIER_REQUIRED} (no email and no usable
     *         phone; an {@code INVALID} phone is not usable)
     * @throws com.sportconnect.common.exception.ConflictException {@code PHONE_ALREADY_USED}, {@code EMAIL_ALREADY_REGISTERED}
     * @throws org.springframework.dao.DataIntegrityViolationException when two first sign-ins for the same subject race and
     *         this one loses on the primary key; the caller re-reads the account
     */
    ProvisionedUser provisionExternalUser(ExternalIdentity identity);

    /**
     * A25: the per-request authentication gate. Resolves a token subject to whether the account may act and what
     * roles it holds, from a short-lived cache (evicted when the account is deactivated or reactivated) with the
     * database as the fallback, so it keeps answering when Redis is down.
     *
     * <p>Includes deactivated accounts (that is the point: the caller turns {@code isActive == false} into a 401).
     * Empty means no such user, e.g. a valid Keycloak identity that has not been provisioned yet.
     */
    Optional<UserAccessState> getAccessState(UUID userId);

    /**
     * Update user's last login timestamp
     */
    void updateLastLogin(UUID userId);

    /**
     * Self-service password change (U24). Confirms the caller with exactly one proof (their current password, asked of
     * Keycloak, or the code emailed for {@link ConfirmationPurpose#CHANGE_PASSWORD}), then sets {@code newPassword} in
     * Keycloak, the only place a password lives. Other sessions are left as they are.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if the account does not exist or is deactivated
     * @throws com.sportconnect.common.exception.BadRequestException with {@code CONFIRMATION_REQUIRED},
     *         {@code CURRENT_PASSWORD_INCORRECT}, a {@code VERIFICATION_CODE_*} code, or {@code NEW_PASSWORD_REJECTED}
     *         (the realm's password rules refuse the value); nothing changes
     * @throws com.sportconnect.common.exception.TooManyRequestsException with {@code PASSWORD_ATTEMPTS_EXCEEDED}
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak or the code store is down
     */
    void changePassword(UUID userId, String currentPassword, String verificationCode, String newPassword);

    /**
     * Search other active users by name/username, enriched with the caller's friendship status
     * toward each result. keyword is required (minimum 2 characters).
     */
    Page<UserSearchResponse> searchUsers(UUID callerId, String keyword, Pageable pageable);
}

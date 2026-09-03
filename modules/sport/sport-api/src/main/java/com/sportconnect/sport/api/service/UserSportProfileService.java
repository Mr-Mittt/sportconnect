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
     *
     * <p><strong>A20 — {@code request.getIsResume() == true}:</strong> instead of creating or
     * rebuilding, this <em>purely reactivates</em> the caller's soft-deleted profile for
     * {@code request.getSportId()}. The stored scalar columns are kept verbatim; the stored
     * {@code attributes} map is only pruned to the sport's live schema (A10
     * {@code retainDefined} — no request merge). Throws {@code BadRequestException} if there is no
     * soft-deleted row for the pair, or if that row is currently active. Absent / {@code false}
     * keeps A7 behaviour (a soft-deleted row is reactivated but fully repopulated from the request).
     */
    UserSportProfileResponse createProfile(UUID userId, CreateUserSportProfileRequest request);

    /**
     * Get user sport profile by ID
     */
    UserSportProfileResponse getProfileById(Long profileId);

    /**
     * Get all <strong>active</strong> profiles for a user. Soft-deleted profiles are never
     * returned. Equivalent to {@link #getUserProfiles(UUID, boolean) getUserProfiles(userId,
     * false)} — this is the overload cross-domain callers use.
     */
    List<UserSportProfileResponse> getUserProfiles(UUID userId);

    /**
     * Get a user's profiles, optionally including soft-deleted ones.
     *
     * <p>When {@code includeInactive} is {@code true} the result also contains profiles with
     * {@code isActive == false} (each response carries {@code isActive}, so the caller can tell
     * them apart) — this backs the client's "resume a deactivated profile" flow (A20). A profile
     * whose <em>sport</em> has itself been deactivated is omitted regardless of
     * {@code includeInactive}, exactly as in the active-only path — a dead sport disappears from
     * the app and so does anything hanging off it.
     *
     * @param userId          the profile owner
     * @param includeInactive {@code true} to also return soft-deleted profiles
     */
    List<UserSportProfileResponse> getUserProfiles(UUID userId, boolean includeInactive);

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
     * Cross-domain access gate: true only when the user holds a <em>non-soft-deleted</em> profile
     * for the sport <em>and</em> that sport is itself still active.
     *
     * <p>Renamed from {@code hasProfileForSport} by A7, along with the fix that made it live up to
     * its own contract. The old implementation was a bare
     * {@code existsByUserIdAndSportId} — it checked neither condition, while this Javadoc and both
     * call sites already described it as an "active profile" check. Two consequences were live:
     * a user who soft-deleted their profile via {@code deleteProfile} kept every permission it
     * granted, and a profile created while a sport was active kept granting them after that sport
     * was deactivated. The name now states both conditions so the gap cannot re-open silently.
     *
     * <p>Returns {@code false} — never throws — for a missing sport or missing profile, so callers
     * can treat it as a plain predicate. A caller that needs to tell "no profile" apart from
     * "sport switched off" (e.g. for distinct error messages) must check sport status itself via
     * {@code SportService.requireActiveSportById}; this method deliberately collapses both into one boolean.
     *
     * <p>Read paths must not use this as a filter: an entity created while a sport was active
     * keeps resolving after deactivation (see {@code SportService.getActiveSportsByIds}).
     */
    boolean hasActiveProfileForActiveSport(UUID userId, Long sportId);
}

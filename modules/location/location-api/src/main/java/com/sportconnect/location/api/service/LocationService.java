package com.sportconnect.location.api.service;

import com.sportconnect.location.api.dto.CreateLocationRequest;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.dto.ResolvedMapsUrlResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shared, sport-scoped venue directory. Any authenticated user may create a {@code Location} row
 * — this is a crowdsourced list (like adding a venue the first time it's needed), duplicates are
 * an accepted tradeoff. A {@code Location} is always specific to one sport (a multi-sport complex
 * is modeled as multiple rows), so lookups are always sport-scoped.
 */
public interface LocationService {

    LocationResponse createLocation(UUID userId, CreateLocationRequest request);

    LocationResponse getLocation(Long locationId);

    /**
     * Batch lookup by ID. Missing ids are simply absent from the returned map — no exception is
     * thrown, mirroring {@code UserService.getUsersByIds}'/{@code SportService.getActiveSportsByIds}'
     * semantics. For cross-domain callers (session-impl resolving a session's location) that need
     * to batch-resolve locations for a page of items without one query per item.
     */
    Map<Long, LocationResponse> getLocationsByIds(List<Long> locationIds);

    Page<LocationResponse> searchLocations(Long sportId, String query, Pageable pageable);

    /**
     * Parses (or, for a short link, resolves via a redirect follow) coordinates out of a pasted
     * Google Maps URL. Does NOT persist anything — the caller reviews/edits the result and then
     * calls {@link #createLocation} separately.
     *
     * @throws com.sportconnect.common.exception.BadRequestException 400 {@code LOCATION_MAPS_URL_INVALID} if the text is not a URL with a host,
     *         or {@code LOCATION_MAPS_URL_UNSUPPORTED} if the host is not a Google Maps host (LOC-6); a blank url stays a generic 400
     */
    ResolvedMapsUrlResponse resolveGoogleMapsUrl(String url);

    /**
     * Favorite a location (LOC-2). Requires the caller to hold an active {@code UserSportProfile}
     * for the location's sport (checked via {@code sport-api}'s
     * {@code UserSportProfileService.hasActiveProfileForActiveSport}, the same gate {@code createGroup} uses
     * for group creation).
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException 404 {@code LOCATION_NOT_FOUND} if the location doesn't exist
     * @throws com.sportconnect.common.exception.BadRequestException 400 {@code LOCATION_SPORT_PROFILE_REQUIRED} without an active profile for the location's sport
     * @throws com.sportconnect.common.exception.ConflictException 409 {@code LOCATION_ALREADY_FAVORITED} if the caller already favorited it (LOC-6; was a 400)
     */
    void favoriteLocation(UUID userId, Long locationId);

    /**
     * Unfavorite a location.
     *
     * @throws com.sportconnect.common.exception.ConflictException 409 {@code LOCATION_NOT_FAVORITED} if the caller hasn't favorited it (LOC-6; was a 400)
     */
    void unfavoriteLocation(UUID userId, Long locationId);

    /**
     * The caller's favorited locations for one sport, paginated. {@code sportId} is required —
     * throws {@code BadRequestException} if null, same as {@link #searchLocations}.
     */
    Page<LocationResponse> getFavoriteLocations(UUID userId, Long sportId, Pageable pageable);
}

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
     * thrown, mirroring {@code UserService.getUsersByIds}'/{@code SportService.getSportsByIds}'
     * semantics. For cross-domain callers (session-impl resolving a session's location) that need
     * to batch-resolve locations for a page of items without one query per item.
     */
    Map<Long, LocationResponse> getLocationsByIds(List<Long> locationIds);

    Page<LocationResponse> searchLocations(Long sportId, String query, Pageable pageable);

    /**
     * Parses (or, for a short link, resolves via a redirect follow) coordinates out of a pasted
     * Google Maps URL. Does NOT persist anything — the caller reviews/edits the result and then
     * calls {@link #createLocation} separately.
     */
    ResolvedMapsUrlResponse resolveGoogleMapsUrl(String url);
}

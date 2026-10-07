package com.sportconnect.location.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.location.api.dto.CreateLocationRequest;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.dto.ResolvedMapsUrlResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.entity.UserFavoriteLocation;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.location.repository.UserFavoriteLocationRepository;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LocationServiceImpl implements LocationService {

    private final LocationRepository locationRepository;
    private final UserFavoriteLocationRepository userFavoriteLocationRepository;
    private final SportService sportService;
    private final UserSportProfileService userSportProfileService;
    private final GoogleMapsUrlResolver googleMapsUrlResolver;
    private final LocationTimeZoneResolver locationTimeZoneResolver;

    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Override
    @Transactional
    public LocationResponse createLocation(UUID userId, CreateLocationRequest request) {
        // A7: a location is permanently tagged with a sport, so it cannot be created against a
        // sport an admin has switched off. Previously this path validated the sportId not at all
        // - not even that the sport existed - so a dangling id could be persisted.
        // A7: unknown and deactivated alike throw ResourceNotFoundException.
        sportService.requireActiveSportById(request.getSportId());

        Location location = Location.builder()
                .sportId(request.getSportId())
                .name(request.getName())
                .address(request.getAddress())
                .sourceMapsUrl(request.getSourceMapsUrl())
                .createdBy(userId)
                .build();

        // LOC-4: timezone is derived from coordinates when present, never manually entered.
        // Best-effort - stays null when there are no coordinates, and also null (not rejected,
        // not defaulted) when coordinates fall outside every timezone polygon (open ocean, parts
        // of Antarctica) - see LocationTimeZoneResolver's Javadoc.
        if (request.getLatitude() != null && request.getLongitude() != null) {
            location.setLocation(geometryFactory.createPoint(
                    new Coordinate(request.getLongitude(), request.getLatitude())));
            locationTimeZoneResolver.resolve(request.getLatitude(), request.getLongitude())
                    .ifPresent(location::setTimezone);
        }

        Location saved = locationRepository.save(location);
        log.info("Created location {} ({}) for sport {}", saved.getId(), saved.getName(), saved.getSportId());
        return toResponse(saved, resolveSportName(saved.getSportId()));
    }

    @Override
    @Transactional(readOnly = true)
    public LocationResponse getLocation(Long locationId) {
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> locationNotFound(locationId));
        return toResponse(location, resolveSportName(location.getSportId()));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, LocationResponse> getLocationsByIds(List<Long> locationIds) {
        if (locationIds == null || locationIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<Location> locations = locationRepository.findByIdIn(locationIds);
        Map<Long, String> sportNames = resolveSportNames(locations);
        return locations.stream()
                .collect(Collectors.toMap(Location::getId, l -> toResponse(l, sportNames.get(l.getSportId()))));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<LocationResponse> searchLocations(Long sportId, String query, Pageable pageable) {
        if (sportId == null) {
            throw new BadRequestException("sportId is required");
        }
        Page<Location> locations = locationRepository.findBySportIdAndNameContainingIgnoreCase(
                sportId, query == null ? "" : query, pageable);
        Map<Long, String> sportNames = resolveSportNames(locations.getContent());
        return locations.map(l -> toResponse(l, sportNames.get(l.getSportId())));
    }

    @Override
    public ResolvedMapsUrlResponse resolveGoogleMapsUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new BadRequestException("url is required");
        }
        GoogleMapsUrlResolver.Resolved resolved = googleMapsUrlResolver.resolve(url);
        return ResolvedMapsUrlResponse.builder()
                .latitude(resolved.latitude())
                .longitude(resolved.longitude())
                .suggestedName(resolved.suggestedName())
                .build();
    }

    @Override
    @Transactional
    public void favoriteLocation(UUID userId, Long locationId) {
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> locationNotFound(locationId));

        if (!userSportProfileService.hasActiveProfileForActiveSport(userId, location.getSportId())) {
            throw new BadRequestException("LOCATION_SPORT_PROFILE_REQUIRED",
                    "You need an active profile for this location's sport to favorite it", null);
        }
        if (userFavoriteLocationRepository.existsByUserIdAndLocationId(userId, locationId)) {
            throw new ConflictException("LOCATION_ALREADY_FAVORITED", "You have already favorited this location", null);
        }

        UserFavoriteLocation favorite = UserFavoriteLocation.builder()
                .userId(userId)
                .locationId(locationId)
                .build();
        userFavoriteLocationRepository.save(favorite);
        log.info("User {} favorited location {}", userId, locationId);
    }

    @Override
    @Transactional
    public void unfavoriteLocation(UUID userId, Long locationId) {
        if (!userFavoriteLocationRepository.existsByUserIdAndLocationId(userId, locationId)) {
            throw new ConflictException("LOCATION_NOT_FAVORITED", "You have not favorited this location", null);
        }
        userFavoriteLocationRepository.deleteByUserIdAndLocationId(userId, locationId);
        log.info("User {} unfavorited location {}", userId, locationId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<LocationResponse> getFavoriteLocations(UUID userId, Long sportId, Pageable pageable) {
        if (sportId == null) {
            throw new BadRequestException("sportId is required");
        }
        Page<Location> locations = userFavoriteLocationRepository.findFavoritesByUserIdAndSportId(
                userId, sportId, pageable);
        Map<Long, String> sportNames = resolveSportNames(locations.getContent());
        return locations.map(l -> toResponse(l, sportNames.get(l.getSportId())));
    }

    /**
     * LOC-6: 404 {@code LOCATION_NOT_FOUND}. The response message carries no id (the client localizes
     * from the code); the id is logged here instead, since the exception handler does not log.
     */
    private ResourceNotFoundException locationNotFound(Long locationId) {
        log.warn("Location {} not found", locationId);
        return ResourceNotFoundException.coded("LOCATION_NOT_FOUND", "Location not found", null);
    }

    private String resolveSportName(Long sportId) {
        if (sportId == null) {
            return null;
        }
        return sportService.getActiveSportsByIds(List.of(sportId)).values().stream()
                .findFirst()
                .map(SportResponse::getName)
                .orElse(null);
    }

    private Map<Long, String> resolveSportNames(List<Location> locations) {
        List<Long> sportIds = locations.stream()
                .map(Location::getSportId)
                .distinct()
                .collect(Collectors.toList());
        if (sportIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return sportService.getActiveSportsByIds(sportIds).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getName()));
    }

    private LocationResponse toResponse(Location location, String sportName) {
        Double latitude = null;
        Double longitude = null;
        if (location.getLocation() != null) {
            latitude = location.getLocation().getY();
            longitude = location.getLocation().getX();
        }
        return LocationResponse.builder()
                .id(location.getId())
                .sportId(location.getSportId())
                .sportName(sportName)
                .name(location.getName())
                .address(location.getAddress())
                .latitude(latitude)
                .longitude(longitude)
                .sourceMapsUrl(location.getSourceMapsUrl())
                .timezone(location.getTimezone())
                .claimedByVendorId(location.getClaimedByVendorId())
                .createdBy(location.getCreatedBy())
                .createdAt(location.getCreatedAt())
                .updatedAt(location.getUpdatedAt())
                .build();
    }
}

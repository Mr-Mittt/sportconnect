package com.sportconnect.location.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.location.api.dto.CreateLocationRequest;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.dto.ResolvedMapsUrlResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.service.SportService;
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
    private final SportService sportService;
    private final GoogleMapsUrlResolver googleMapsUrlResolver;

    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Override
    @Transactional
    public LocationResponse createLocation(UUID userId, CreateLocationRequest request) {
        Location location = Location.builder()
                .sportId(request.getSportId())
                .name(request.getName())
                .address(request.getAddress())
                .sourceMapsUrl(request.getSourceMapsUrl())
                .createdBy(userId)
                .build();

        if (request.getLatitude() != null && request.getLongitude() != null) {
            location.setLocation(geometryFactory.createPoint(
                    new Coordinate(request.getLongitude(), request.getLatitude())));
        }

        Location saved = locationRepository.save(location);
        log.info("Created location {} ({}) for sport {}", saved.getId(), saved.getName(), saved.getSportId());
        return toResponse(saved, resolveSportName(saved.getSportId()));
    }

    @Override
    @Transactional(readOnly = true)
    public LocationResponse getLocation(Long locationId) {
        Location location = locationRepository.findById(locationId)
                .orElseThrow(() -> new ResourceNotFoundException("Location", "id", locationId));
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

    private String resolveSportName(Long sportId) {
        if (sportId == null) {
            return null;
        }
        return sportService.getSportsByIds(List.of(sportId)).values().stream()
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
        return sportService.getSportsByIds(sportIds).entrySet().stream()
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
                .claimedByVendorId(location.getClaimedByVendorId())
                .createdBy(location.getCreatedBy())
                .createdAt(location.getCreatedAt())
                .updatedAt(location.getUpdatedAt())
                .build();
    }
}

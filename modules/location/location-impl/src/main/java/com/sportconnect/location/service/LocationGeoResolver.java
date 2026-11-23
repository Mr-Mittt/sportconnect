package com.sportconnect.location.service;

import com.sportconnect.reference.api.dto.GeoMatch;
import com.sportconnect.reference.api.service.ReferenceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Finds the reference country and region of a coordinate for a venue (LOC-5), offline, through
 * {@link ReferenceService#resolveByCoordinates}.
 *
 * <p><b>Never throws, and cannot poison the caller's transaction.</b> {@code ReferenceServiceImpl} is a transactional
 * proxy: an exception passing through it marks the surrounding transaction rollback-only even if the caller catches
 * it, so a try/catch inside {@code createLocation} alone would not keep the save alive. This method therefore runs with
 * {@link Propagation#NOT_SUPPORTED}: the caller's transaction is suspended, the lookup runs in its own, and a failure
 * is logged here and answered as empty. The cost is one extra pooled connection for the length of two small queries.
 *
 * <p>Unlike {@link LocationTimeZoneResolver} (LOC-7), a failure here is deliberately swallowed: a venue without a
 * country is merely missing from region and country boards, while a venue without a timezone schedules sessions in
 * the wrong zone.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LocationGeoResolver {

    private final ReferenceService referenceService;

    /**
     * @return the active country (and region where seeded) containing the point; empty when nothing matches or the
     *         lookup failed
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Optional<GeoMatch> resolve(double latitude, double longitude) {
        try {
            return referenceService.resolveByCoordinates(latitude, longitude);
        } catch (RuntimeException e) {
            log.warn("Could not resolve country/region for coordinates ({}, {}): {}", latitude, longitude, e.toString());
            return Optional.empty();
        }
    }
}

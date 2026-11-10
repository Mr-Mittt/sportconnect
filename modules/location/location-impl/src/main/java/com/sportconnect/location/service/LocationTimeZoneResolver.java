package com.sportconnect.location.service;

import lombok.extern.slf4j.Slf4j;
import net.iakovlev.timeshape.TimeZoneEngine;
import org.springframework.stereotype.Component;

import java.time.ZoneId;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Derives a location's IANA timezone from its coordinates (LOC-4), via an offline
 * point-in-polygon lookup against the bundled timezone-boundary dataset — no external network
 * call, no API key, unlike {@link GoogleMapsUrlResolver}'s live HTTP redirect-following.
 *
 * <p>Returns empty, rather than guessing a fallback zone, when no polygon matches. In practice
 * this dataset gives full global coverage — every physically valid
 * coordinate resolves to <em>something</em>, including open ocean and both poles (nautical
 * {@code Etc/GMT±N} zones and Antarctica territorial claims — verified empirically, e.g.
 * {@code (0, -140) -> Etc/GMT+9}). {@link TimeZoneEngine#query} also never validates its input, so
 * empty in practice mainly surfaces for a genuinely out-of-range coordinate (no real polygon lives
 * past ±90° latitude) — which also makes this the practical safety net for
 * {@code CreateLocationRequest}'s pre-existing lack of latitude/longitude range validation, a
 * separate, out-of-scope gap this ticket doesn't fix. {@link
 * com.sportconnect.location.service.LocationServiceImpl#createLocation} persists whatever comes
 * back (present or empty) as-is.
 *
 * <p><b>A failure to build the engine is NOT swallowed (LOC-7).</b> A location saved without its
 * timezone makes the sessions generated at it use the JVM's own zone ({@code
 * SessionGenerationService#resolveZone}), silently wrong, so an engine that cannot start fails the
 * save instead of returning empty. The first such failure was zstd-jni (which {@code TimeZoneEngine}
 * reads its data through) unable to load its native library from the production container's
 * {@code noexec} {@code /tmp}: every location save returned a 500 until the image gave the library
 * its own exec folder ({@code sportconnect-deploy.sh}). Do not add a
 * catch that turns that into {@code Optional.empty()}. A failed start is not cached, so a transient
 * one recovers on the next call.
 *
 * <p><b>Self-managed lazy init, not a Spring {@code @Lazy} bean.</b> {@code
 * TimeZoneEngine.initialize()} is expensive enough (builds an in-memory spatial index over the
 * bundled dataset) that eager initialization at every Spring context bootstrap caused {@code
 * OutOfMemoryError: Java heap space} across {@code :server:test}'s many context configurations —
 * most of which never create a location at all, since {@link LocationServiceImpl} sits
 * transitively behind nearly every module. Marking this component {@code @Lazy} was tried first
 * and did not defer initialization in practice (confirmed via the same OOM recurring with the
 * annotation correctly present in the compiled class) — the double-checked-locking field below
 * defers the real cost to the first actual {@link #resolve} call regardless of how Spring wires
 * this bean, with no dependency on proxy behavior at all.
 */
@Slf4j
@Component
public class LocationTimeZoneResolver {

    private final Supplier<TimeZoneEngine> engineFactory;
    private volatile TimeZoneEngine timeZoneEngine;

    /** Test-only: inject a pre-built engine (e.g. a {@code @Shared} one) to avoid re-running the
     * expensive {@link TimeZoneEngine#initialize()} once per test method. */
    LocationTimeZoneResolver(TimeZoneEngine timeZoneEngine) {
        this.engineFactory = TimeZoneEngine::initialize;
        this.timeZoneEngine = timeZoneEngine;
    }

    /** Test-only: replace how the engine is built, to simulate it failing. */
    LocationTimeZoneResolver(Supplier<TimeZoneEngine> engineFactory) {
        this.engineFactory = engineFactory;
    }

    public LocationTimeZoneResolver() {
        this.engineFactory = TimeZoneEngine::initialize;
    }

    /** Returns the IANA zone id at the given coordinates, or empty if none matches. */
    public Optional<String> resolve(double latitude, double longitude) {
        return engine().query(latitude, longitude)
                .map(ZoneId::getId);
    }

    private TimeZoneEngine engine() {
        TimeZoneEngine result = timeZoneEngine;
        if (result == null) {
            synchronized (this) {
                result = timeZoneEngine;
                if (result == null) {
                    timeZoneEngine = result = engineFactory.get();
                }
            }
        }
        return result;
    }
}

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
 * <p>Best-effort by design: returns empty (never throws) rather than reject or default to a
 * fallback zone. In practice this dataset gives full global coverage — every physically valid
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
 *
 * <p><b>A broken engine never breaks the save (LOC-7).</b> {@code TimeZoneEngine} reads its dataset
 * through zstd-jni, which unpacks a native library into a temp folder and loads it. On the
 * production box the container's {@code /tmp} is mounted {@code noexec}, the load failed with an
 * {@code UnsatisfiedLinkError}, and because that surfaces as a {@link LinkageError} (an {@code Error},
 * not an {@code Exception}) it escaped as an unhandled 500 on every location save. A failure to
 * build the engine is now logged once at ERROR and remembered: from then on every call returns
 * empty (the location is saved without a timezone) instead of retrying a class the JVM can no
 * longer initialise. The cause is still fixed where it lives (the image's native-library folder,
 * {@code server/Dockerfile} and {@code sportconnect-deploy.sh}); this only makes the next such
 * failure a degraded save and not an outage.
 */
@Slf4j
@Component
public class LocationTimeZoneResolver {

    private final Supplier<TimeZoneEngine> engineFactory;
    private volatile TimeZoneEngine timeZoneEngine;
    /** Set once building the engine failed with an error; the JVM cannot recover that class, so no retry. */
    private volatile boolean engineUnavailable;

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

    /** Returns the IANA zone id at the given coordinates, or empty if none matches or the engine is unavailable. */
    public Optional<String> resolve(double latitude, double longitude) {
        TimeZoneEngine engine = engine();
        if (engine == null) {
            return Optional.empty();
        }
        return engine.query(latitude, longitude)
                .map(ZoneId::getId);
    }

    private TimeZoneEngine engine() {
        TimeZoneEngine result = timeZoneEngine;
        if (result == null && !engineUnavailable) {
            synchronized (this) {
                result = timeZoneEngine;
                if (result == null && !engineUnavailable) {
                    try {
                        timeZoneEngine = result = engineFactory.get();
                    } catch (LinkageError | RuntimeException e) {
                        // LinkageError covers UnsatisfiedLinkError, NoClassDefFoundError and ExceptionInInitializerError
                        // (a native library that cannot be loaded). OutOfMemoryError and the like are not caught on purpose.
                        engineUnavailable = true;
                        log.error("LOC-7: the timezone engine cannot start; locations are saved without a timezone until the server is restarted. "
                                + "Check that the native-library folder is writable and executable (docs: PRODUCTION_DEPLOYMENT_GUIDE.md, run flags of the server container)", e);
                    }
                }
            }
        }
        return result;
    }
}

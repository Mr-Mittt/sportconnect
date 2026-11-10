package com.sportconnect.location.service

import net.iakovlev.timeshape.TimeZoneEngine
import spock.lang.Shared
import spock.lang.Specification
import spock.lang.Subject

import java.util.function.Supplier

/**
 * Uses a real {@link TimeZoneEngine} rather than a mock — this is a deterministic, offline
 * lookup against real timezone-boundary data (same spirit as not mocking JTS geometry elsewhere
 * in this module), and the whole point of LOC-4 is that the derived value is actually correct.
 * {@code initialize()} builds an in-memory spatial index over the bundled dataset, expensive
 * enough to share across test methods via {@code @Shared} rather than rebuild per test.
 */
class LocationTimeZoneResolverSpec extends Specification {

    @Shared
    TimeZoneEngine engine = TimeZoneEngine.initialize()

    @Subject
    LocationTimeZoneResolver resolver = new LocationTimeZoneResolver(engine)

    def "resolves a known coordinate to its real IANA zone"() {
        expect:
        resolver.resolve(latitude, longitude) == Optional.of(expectedZone)

        where:
        latitude    | longitude     | expectedZone
        37.4224764  | -122.0842499  | "America/Los_Angeles" // Mountain View, CA
        10.7626     | 106.6602      | "Asia/Ho_Chi_Minh"     // Ho Chi Minh City
        51.5074     | -0.1278       | "Europe/London"
    }

    def "no-arg constructor lazily initializes its own engine on first use"() {
        given:
        def lazyResolver = new LocationTimeZoneResolver()

        expect:
        lazyResolver.resolve(10.7626d, 106.6602d) == Optional.of("Asia/Ho_Chi_Minh")
    }

    def "returns empty for a physically invalid coordinate"() {
        // TimeZoneEngine.query never validates its input, it just runs the spatial index lookup
        // and returns empty when nothing matches — a genuinely out-of-range value (no real
        // polygon lives past +/-90 latitude) resolves the same way a real ocean/Antarctica
        // coordinate would, since every valid Earth coordinate actually resolves to *something*
        // (Etc/GMT+-N nautical zones and Antarctica claims give full global coverage — verified:
        // (0, -140) -> Etc/GMT+9, both poles -> Etc/GMT / Antarctica/McMurdo). This is also the
        // practical safety net for CreateLocationRequest's pre-existing lack of latitude/longitude
        // range validation (a separate, out-of-scope gap this ticket doesn't need to fix).
        expect:
        resolver.resolve(200.0d, 0.0d) == Optional.empty()
    }

    // LOC-7: a location saved without its timezone makes the sessions generated at it use the JVM's zone, so an engine that
    // cannot start must fail the call, never answer "no zone". On the production box zstd-jni could not load its native library
    // from the noexec /tmp, which surfaced as exactly these errors.
    def "an engine that cannot start fails the call instead of answering no zone"() {
        given:
        def broken = new LocationTimeZoneResolver({ throw failure } as Supplier<TimeZoneEngine>)

        when:
        broken.resolve(10.7626d, 106.6602d)

        then:
        def thrown = thrown(Throwable)
        thrown.is(failure)

        where:
        failure << [
                new UnsatisfiedLinkError("/tmp/libzstd-jni.so: failed to map segment from shared object"),
                new NoClassDefFoundError("Could not initialize class com.github.luben.zstd.ZstdInputStreamNoFinalizer"),
                new ExceptionInInitializerError("Cannot unpack libzstd-jni-1.5.7-11: No such file or directory"),
                new IllegalStateException("dataset unreadable")
        ]
    }

    def "a failed start is not cached: the next call builds the engine again and answers"() {
        given:
        def calls = 0
        def flaky = new LocationTimeZoneResolver({
            if (calls++ == 0) { throw new IllegalStateException("transient") }
            engine
        } as Supplier<TimeZoneEngine>)

        when:
        flaky.resolve(10.7626d, 106.6602d)

        then:
        thrown(IllegalStateException)

        when:
        def zone = flaky.resolve(10.7626d, 106.6602d)

        then:
        zone == Optional.of("Asia/Ho_Chi_Minh")
        calls == 2
    }
}

package com.sportconnect.location.service

import com.sportconnect.location.entity.Location
import com.sportconnect.location.repository.LocationRepository
import com.sportconnect.reference.api.dto.CountryResponse
import com.sportconnect.reference.api.dto.GeoMatch
import com.sportconnect.reference.api.dto.RegionResponse
import org.locationtech.jts.geom.Coordinate
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.geom.PrecisionModel
import spock.lang.Specification
import spock.lang.Subject

class LocationGeoBackfillRunnerSpec extends Specification {

    LocationRepository locationRepository = Mock()
    LocationGeoResolver locationGeoResolver = Mock()
    def geometryFactory = new GeometryFactory(new PrecisionModel(), 4326)

    @Subject
    LocationGeoBackfillRunner runner = new LocationGeoBackfillRunner(locationRepository, locationGeoResolver)

    private Location venue(long id, double lat = 10.0d, double lng = 106.0d) {
        Location.builder().id(id).location(geometryFactory.createPoint(new Coordinate(lng, lat))).build()
    }

    private static GeoMatch match(Long country, Long region) {
        GeoMatch.builder().country(CountryResponse.builder().id(country).build())
                .region(region == null ? null : RegionResponse.builder().id(region).build()).build()
    }

    def "links every venue the resolver matches, with the guarded update, and reports the counts"() {
        when:
        def result = runner.backfill()

        then: "one page, then the empty page that ends the run, the cursor moving to the last id"
        1 * locationRepository.findGeoBackfillBatch(0L, _) >> [venue(1L), venue(2L)]
        1 * locationRepository.findGeoBackfillBatch(2L, _) >> []
        1 * locationGeoResolver.resolve(10.0d, 106.0d) >> Optional.of(match(84L, 79L))
        1 * locationGeoResolver.resolve(10.0d, 106.0d) >> Optional.of(match(84L, null))
        1 * locationRepository.linkGeoIfUnset(1L, 84L, 79L) >> 1
        1 * locationRepository.linkGeoIfUnset(2L, 84L, null) >> 1
        result == new LocationGeoBackfillRunner.Result(2, 2, 0)
    }

    def "a venue that resolves to nothing is tried once, left unlinked, and does not loop the run"() {
        when:
        def result = runner.backfill()

        then:
        1 * locationRepository.findGeoBackfillBatch(0L, _) >> [venue(7L)]
        1 * locationRepository.findGeoBackfillBatch(7L, _) >> []
        1 * locationGeoResolver.resolve(_, _) >> Optional.empty()
        0 * locationRepository.linkGeoIfUnset(*_)
        result == new LocationGeoBackfillRunner.Result(1, 0, 1)
    }

    def "a venue another instance already linked counts as unresolved here and is not overwritten"() {
        when:
        def result = runner.backfill()

        then:
        1 * locationRepository.findGeoBackfillBatch(0L, _) >> [venue(3L)]
        1 * locationRepository.findGeoBackfillBatch(3L, _) >> []
        1 * locationGeoResolver.resolve(_, _) >> Optional.of(match(84L, 79L))
        1 * locationRepository.linkGeoIfUnset(3L, 84L, 79L) >> 0
        result == new LocationGeoBackfillRunner.Result(1, 0, 1)
    }

    def "nothing to backfill costs one query and never touches the resolver"() {
        when:
        def result = runner.backfill()

        then:
        1 * locationRepository.findGeoBackfillBatch(0L, _) >> []
        0 * locationGeoResolver._
        result == new LocationGeoBackfillRunner.Result(0, 0, 0)
    }

    def "run() never lets a failure stop start-up"() {
        when:
        runner.run(null)

        then:
        1 * locationRepository.findGeoBackfillBatch(0L, _) >> { throw new IllegalStateException("db down") }
        noExceptionThrown()
    }
}

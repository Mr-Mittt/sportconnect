package com.sportconnect.location.service

import com.sportconnect.reference.api.dto.CountryResponse
import com.sportconnect.reference.api.dto.GeoMatch
import com.sportconnect.reference.api.service.ReferenceService
import spock.lang.Specification
import spock.lang.Subject

class LocationGeoResolverSpec extends Specification {

    ReferenceService referenceService = Mock()

    @Subject
    LocationGeoResolver resolver = new LocationGeoResolver(referenceService)

    def "passes the reference match through"() {
        given:
        def match = GeoMatch.builder().country(CountryResponse.builder().id(84L).build()).build()

        when:
        def result = resolver.resolve(10.77d, 106.70d)

        then:
        1 * referenceService.resolveByCoordinates(10.77d, 106.70d) >> Optional.of(match)
        result.get() == match
    }

    def "a failing lookup is answered as empty, never thrown"() {
        when:
        def result = resolver.resolve(10.77d, 106.70d)

        then:
        1 * referenceService.resolveByCoordinates(_, _) >> { throw new IllegalStateException("boundary data missing") }
        result.isEmpty()
        noExceptionThrown()
    }
}

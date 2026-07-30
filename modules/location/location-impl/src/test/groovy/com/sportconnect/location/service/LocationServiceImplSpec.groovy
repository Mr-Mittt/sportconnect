package com.sportconnect.location.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.location.api.dto.CreateLocationRequest
import com.sportconnect.location.entity.Location
import com.sportconnect.location.repository.LocationRepository
import com.sportconnect.sport.api.dto.SportResponse
import com.sportconnect.sport.api.service.SportService
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

class LocationServiceImplSpec extends Specification {

    LocationRepository locationRepository = Mock()
    SportService sportService = Mock()
    GoogleMapsUrlResolver googleMapsUrlResolver = Mock()

    @Subject
    LocationServiceImpl locationService = new LocationServiceImpl(locationRepository, sportService, googleMapsUrlResolver)

    def "createLocation saves a location with coordinates when lat/lng provided"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateLocationRequest.builder()
                .sportId(1L)
                .name("Riverside Court")
                .address("123 River Rd")
                .latitude(37.4224764d)
                .longitude(-122.0842499d)
                .build()

        def saved = Location.builder()
                .id(10L)
                .sportId(1L)
                .name("Riverside Court")
                .address("123 River Rd")
                .createdBy(userId)
                .build()

        when:
        def result = locationService.createLocation(userId, request)

        then:
        1 * locationRepository.save({ Location loc ->
            loc.sportId == 1L && loc.name == "Riverside Court" && loc.location != null
        }) >> saved
        1 * sportService.getSportsByIds([1L]) >> [1L: SportResponse.builder().id(1L).name("Basketball").build()]
        result.id == 10L
        result.sportName == "Basketball"
    }

    def "createLocation saves a location without coordinates when lat/lng omitted"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateLocationRequest.builder()
                .sportId(1L)
                .name("Name Only Court")
                .build()

        def saved = Location.builder().id(11L).sportId(1L).name("Name Only Court").createdBy(userId).build()

        when:
        locationService.createLocation(userId, request)

        then:
        1 * locationRepository.save({ Location loc -> loc.location == null }) >> saved
        1 * sportService.getSportsByIds([1L]) >> [:]
    }

    def "getLocation returns the location when found"() {
        given:
        def location = Location.builder().id(5L).sportId(2L).name("Court").createdBy(UUID.randomUUID()).build()

        when:
        def result = locationService.getLocation(5L)

        then:
        1 * locationRepository.findById(5L) >> Optional.of(location)
        1 * sportService.getSportsByIds([2L]) >> [2L: SportResponse.builder().id(2L).name("Tennis").build()]
        result.id == 5L
        result.sportName == "Tennis"
    }

    def "getLocation throws ResourceNotFoundException when missing"() {
        when:
        locationService.getLocation(99L)

        then:
        1 * locationRepository.findById(99L) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getLocationsByIds returns an empty map for an empty input list"() {
        when:
        def result = locationService.getLocationsByIds([])

        then:
        0 * locationRepository._
        result.isEmpty()
    }

    def "getLocationsByIds batch-resolves without per-row sport calls"() {
        given:
        def locations = [
                Location.builder().id(1L).sportId(1L).name("A").createdBy(UUID.randomUUID()).build(),
                Location.builder().id(2L).sportId(1L).name("B").createdBy(UUID.randomUUID()).build()
        ]

        when:
        def result = locationService.getLocationsByIds([1L, 2L])

        then:
        1 * locationRepository.findByIdIn([1L, 2L]) >> locations
        1 * sportService.getSportsByIds([1L]) >> [1L: SportResponse.builder().id(1L).name("Basketball").build()]
        result.size() == 2
        result[1L].sportName == "Basketball"
    }

    def "searchLocations requires a sportId"() {
        when:
        locationService.searchLocations(null, "court", PageRequest.of(0, 10))

        then:
        0 * locationRepository._
        thrown(BadRequestException)
    }

    def "searchLocations delegates to the sport-scoped repository query"() {
        given:
        def pageable = PageRequest.of(0, 10)
        def location = Location.builder().id(1L).sportId(1L).name("Riverside Court").createdBy(UUID.randomUUID()).build()

        when:
        def result = locationService.searchLocations(1L, "river", pageable)

        then:
        1 * locationRepository.findBySportIdAndNameContainingIgnoreCase(1L, "river", pageable) >> new PageImpl([location])
        1 * sportService.getSportsByIds([1L]) >> [1L: SportResponse.builder().id(1L).name("Basketball").build()]
        result.content[0].name == "Riverside Court"
    }

    def "resolveGoogleMapsUrl rejects a blank url"() {
        when:
        locationService.resolveGoogleMapsUrl("  ")

        then:
        0 * googleMapsUrlResolver._
        thrown(BadRequestException)
    }

    def "resolveGoogleMapsUrl delegates to the resolver"() {
        given:
        def resolved = new GoogleMapsUrlResolver.Resolved(37.42d, -122.08d, "Riverside Court")

        when:
        def result = locationService.resolveGoogleMapsUrl("https://maps.google.com/?q=37.42,-122.08")

        then:
        1 * googleMapsUrlResolver.resolve("https://maps.google.com/?q=37.42,-122.08") >> resolved
        result.latitude == 37.42d
        result.suggestedName == "Riverside Court"
    }
}

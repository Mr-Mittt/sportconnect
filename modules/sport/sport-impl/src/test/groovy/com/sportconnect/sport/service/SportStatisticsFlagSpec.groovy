package com.sportconnect.sport.service

import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.CreateSportRequest
import com.sportconnect.sport.api.dto.UpdateSportRequest
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.repository.SportRepository
import spock.lang.Specification
import spock.lang.Subject

/**
 * SESSION-53 rework: the sport's statistics switch ({@code sports.statistics_enabled}). Off by default; an admin switches it
 * through the create and update requests; the statistics runner and the ranking proposal read it through
 * {@code isStatisticsEnabled} and {@code getStatisticsEnabledSportIds}, both served from the active-only sport cache.
 */
class SportStatisticsFlagSpec extends Specification {

    SportRepository sportRepository = Mock()
    SportLookupCache sportLookupCache = Mock()

    @Subject
    SportServiceImpl sportService = new SportServiceImpl(sportRepository, sportLookupCache)

    def "a sport created without the switch has statistics off"() {
        given:
        def request = CreateSportRequest.builder().name("Badminton").category("Racquet").build()
        Sport saved

        when:
        def result = sportService.createSport(request)

        then:
        1 * sportRepository.existsByName("Badminton") >> false
        1 * sportRepository.save(_) >> { Sport sport -> saved = sport; sport }
        1 * sportLookupCache.evictAll()
        saved.statisticsEnabled == false
        result.statisticsEnabled == false
    }

    def "a sport created with the switch on has statistics on"() {
        given:
        def request = CreateSportRequest.builder().name("Badminton").category("Racquet").statisticsEnabled(true).build()
        Sport saved

        when:
        def result = sportService.createSport(request)

        then:
        1 * sportRepository.existsByName("Badminton") >> false
        1 * sportRepository.save(_) >> { Sport sport -> saved = sport; sport }
        saved.statisticsEnabled == true
        result.statisticsEnabled == true
    }

    def "an admin update switches statistics on and the cache is evicted"() {
        given:
        def sport = Sport.builder().id(1L).name("Badminton").isActive(true).build()
        def request = UpdateSportRequest.builder().statisticsEnabled(true).build()

        when:
        def result = sportService.updateSport(1L, request)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport saved -> saved }
        1 * sportLookupCache.evictAll()
        sport.statisticsEnabled == true
        result.statisticsEnabled == true
    }

    def "an admin update switches statistics off"() {
        given:
        def sport = Sport.builder().id(1L).name("Badminton").isActive(true).statisticsEnabled(true).build()
        def request = UpdateSportRequest.builder().statisticsEnabled(false).build()

        when:
        def result = sportService.updateSport(1L, request)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport saved -> saved }
        sport.statisticsEnabled == false
        result.statisticsEnabled == false
    }

    def "an update that does not mention the switch leaves it as it is"() {
        given: "a form that sends only the name must not switch statistics off"
        def sport = Sport.builder().id(1L).name("Badminton").isActive(true).statisticsEnabled(true).build()
        def request = UpdateSportRequest.builder().description("Racquet sport").build()

        when:
        def result = sportService.updateSport(1L, request)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport saved -> saved }
        sport.statisticsEnabled == true
        result.statisticsEnabled == true
    }

    def "isStatisticsEnabled reads the switch of an active sport"() {
        given:
        sportLookupCache.getActiveSportsById() >> [
                (1L): Sport.builder().id(1L).name("Badminton").isActive(true).statisticsEnabled(true).build(),
                (2L): Sport.builder().id(2L).name("Tennis").isActive(true).build()]

        expect:
        sportService.isStatisticsEnabled(1L)
        !sportService.isStatisticsEnabled(2L)
    }

    def "isStatisticsEnabled is a 404 for a sport that is not active"() {
        given: "the cache holds active sports only, so a deactivated sport is simply absent"
        sportLookupCache.getActiveSportsById() >> [(1L): Sport.builder().id(1L).name("Badminton").isActive(true).build()]

        when:
        sportService.isStatisticsEnabled(99L)

        then:
        thrown(ResourceNotFoundException)
    }

    def "getStatisticsEnabledSportIds lists only the active sports that have the switch on"() {
        given:
        sportLookupCache.getActiveSportsById() >> [
                (1L): Sport.builder().id(1L).name("Badminton").isActive(true).statisticsEnabled(true).build(),
                (2L): Sport.builder().id(2L).name("Tennis").isActive(true).build(),
                (3L): Sport.builder().id(3L).name("Football").isActive(true).statisticsEnabled(true).build()]

        expect:
        sportService.getStatisticsEnabledSportIds() == [1L, 3L] as Set
    }

    def "getStatisticsEnabledSportIds is empty when no sport has the switch on"() {
        given:
        sportLookupCache.getActiveSportsById() >> [(1L): Sport.builder().id(1L).name("Tennis").isActive(true).build()]

        expect:
        sportService.getStatisticsEnabledSportIds().isEmpty()
    }
}

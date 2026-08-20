package com.sportconnect.sport.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.CreateSportRequest
import com.sportconnect.sport.api.dto.UpdateSportRequest
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.repository.SportRepository
import spock.lang.Specification
import spock.lang.Subject

class SportServiceImplSpec extends Specification {

    SportRepository sportRepository = Mock()
    SportLookupCache sportLookupCache = Mock()

    @Subject
    SportServiceImpl sportService = new SportServiceImpl(sportRepository, sportLookupCache)

    def "createSport should create new sport successfully"() {
        given:
        def request = CreateSportRequest.builder()
                .name("Basketball")
                .description("Team sport")
                .category("Team Sports")
                .minPlayers(5)
                .maxPlayers(10)
                .build()

        def sport = Sport.builder()
                .id(1L)
                .name("Basketball")
                .description("Team sport")
                .category("Team Sports")
                .minPlayers(5)
                .maxPlayers(10)
                .isActive(true)
                .build()

        when:
        def result = sportService.createSport(request)

        then:
        1 * sportRepository.existsByName("Basketball") >> false
        1 * sportRepository.save(_) >> sport
        1 * sportLookupCache.evictAll()
        result.name == "Basketball"
        result.category == "Team Sports"
    }

    def "createSport should throw exception when sport name already exists"() {
        given:
        def request = CreateSportRequest.builder()
                .name("Basketball")
                .build()

        when:
        sportService.createSport(request)

        then:
        1 * sportRepository.existsByName("Basketball") >> true
        0 * sportLookupCache.evictAll()
        thrown(BadRequestException)
    }

    def "requireActiveSportById should return sport when found"() {
        given:
        def sportId = 1L
        def sport = Sport.builder()
                .id(sportId)
                .name("Tennis")
                .category("Racket Sports")
                .isActive(true)
                .build()

        when:
        def result = sportService.requireActiveSportById(sportId)

        then:
        1 * sportLookupCache.getActiveSportsById() >> [(sportId): sport]
        result.id == sportId
        result.name == "Tennis"
    }

    def "requireActiveSportById should throw exception when sport not found"() {
        given:
        def sportId = 1L

        when:
        sportService.requireActiveSportById(sportId)

        then:
        1 * sportLookupCache.getActiveSportsById() >> [:]
        thrown(ResourceNotFoundException)
    }

    def "getActiveSportsByIds should return a map keyed by id for found sports"() {
        given:
        def allSports = [
            (1L): Sport.builder().id(1L).name("Football").category("Team Sports").isActive(true).build(),
            (2L): Sport.builder().id(2L).name("Tennis").category("Racket Sports").isActive(true).build()
        ]

        when:
        def result = sportService.getActiveSportsByIds([1L, 2L])

        then:
        1 * sportLookupCache.getActiveSportsById() >> allSports
        result.size() == 2
        result[1L].name == "Football"
        result[2L].name == "Tennis"
    }

    def "getActiveSportsByIds should silently omit ids that don't resolve to a sport"() {
        given:
        def allSports = [(1L): Sport.builder().id(1L).name("Football").isActive(true).build()]

        when:
        def result = sportService.getActiveSportsByIds([1L, 999L])

        then:
        1 * sportLookupCache.getActiveSportsById() >> allSports
        result.size() == 1
        result[1L].name == "Football"
        !result.containsKey(999L)
    }

    def "getAllActiveSports should return the cache contents, which are active-only"() {
        given: "A7 moved the isActive filter into the cache itself, so nothing inactive arrives here"
        def activeSports = [
            (1L): Sport.builder().id(1L).name("Football").isActive(true).build(),
            (2L): Sport.builder().id(2L).name("Cricket").isActive(true).build()
        ]

        when:
        def result = sportService.getAllActiveSports()

        then:
        1 * sportLookupCache.getActiveSportsById() >> activeSports
        result.size() == 2
        result*.name as Set == ["Football", "Cricket"] as Set
    }

    def "getAllSports should return all sports including inactive, bypassing the cache"() {
        given: "the admin-only listing — A7 made the cache active-only, so this reads the table"
        def allSports = [
            Sport.builder().id(1L).name("Football").isActive(true).build(),
            Sport.builder().id(2L).name("Cricket").isActive(false).build()
        ]

        when:
        def result = sportService.getAllSports()

        then:
        1 * sportRepository.findAll() >> allSports

        and: "the cache is neither read nor populated — an admin listing must not evict or warm it"
        0 * sportLookupCache._

        and:
        result.size() == 2
        result*.name as Set == ["Football", "Cricket"] as Set
    }

    def "getSportsByCategory should return sports in category"() {
        given:
        def category = "Team Sports"
        def sports = [
            Sport.builder().id(1L).name("Football").category(category).isActive(true).build()
        ]

        when:
        def result = sportService.getSportsByCategory(category)

        then:
        1 * sportRepository.findByCategoryAndIsActiveTrue(category) >> sports
        result.size() == 1
        result[0].category == category
    }

    def "updateSport should update all provided fields"() {
        given:
        def sportId = 1L
        def sport = Sport.builder()
                .id(sportId)
                .name("Football")
                .description("Old description")
                .category("Team Sports")
                .minPlayers(11)
                .maxPlayers(22)
                .isActive(true)
                .build()

        def request = UpdateSportRequest.builder()
                .description("Updated description")
                .minPlayers(5)
                .maxPlayers(10)
                .build()

        when:
        def result = sportService.updateSport(sportId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport savedSport ->
            assert savedSport.description == "Updated description"
            assert savedSport.minPlayers == 5
            assert savedSport.maxPlayers == 10
            return savedSport
        }
        1 * sportLookupCache.evictAll()
        result.description == "Updated description"
    }

    def "updateSport should throw exception when sport not found"() {
        given:
        def sportId = 1L
        def request = new UpdateSportRequest()

        when:
        sportService.updateSport(sportId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.empty()
        0 * sportLookupCache.evictAll()
        thrown(ResourceNotFoundException)
    }

    def "deleteSport should soft delete sport"() {
        given:
        def sportId = 1L
        def sport = Sport.builder()
                .id(sportId)
                .name("Football")
                .isActive(true)
                .build()

        when:
        sportService.deleteSport(sportId)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport savedSport ->
            assert savedSport.isActive == false
            return savedSport
        }
        1 * sportLookupCache.evictAll()
    }

    def "deleteSport should throw exception when sport not found"() {
        given:
        def sportId = 1L

        when:
        sportService.deleteSport(sportId)

        then:
        1 * sportRepository.findById(sportId) >> Optional.empty()
        0 * sportLookupCache.evictAll()
        thrown(ResourceNotFoundException)
    }

    def "existsByName should return true when sport exists"() {
        given:
        def name = "Basketball"

        when:
        def result = sportService.existsByName(name)

        then:
        1 * sportRepository.existsByName(name) >> true
        result == true
    }

    def "existsByName should return false when sport does not exist"() {
        given:
        def name = "NewSport"

        when:
        def result = sportService.existsByName(name)

        then:
        1 * sportRepository.existsByName(name) >> false
        result == false
    }
}

package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.CreateSportRequest
import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import com.sportconnect.sport.api.dto.UpdateSportRequest
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.repository.SportRepository
import spock.lang.Specification
import spock.lang.Subject

class SportServiceImplSpec extends Specification {

    SportRepository sportRepository = Mock()
    SportLookupCache sportLookupCache = Mock()
    // A9: both real rather than Mock(). The validator is a pure function whose whole value is the
    // rules it enforces, and a mocked ObjectMapper would make the stored-document round trip prove
    // nothing about whether the schema actually serialises.
    ObjectMapper objectMapper = new ObjectMapper()
    SportAttributeSchemaValidator schemaValidator = new SportAttributeSchemaValidator(objectMapper)

    @Subject
    SportServiceImpl sportService =
            new SportServiceImpl(sportRepository, sportLookupCache, schemaValidator, objectMapper)

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

    // --- A9: per-sport attribute schema ---

    def "getAttributeSchema returns the sport's stored document"() {
        given:
        def sportId = 1L
        def stored = [
                defaultLocale: "en",
                groups       : [[key       : "gear", label: [en: "Gear"], isAvailable: true, order: 1,
                                  attributes: [[key: "racket", label: [en: "Racket"], type: "STRING",
                                                isAvailable: true, order: 1]]]]
        ]
        def sport = Sport.builder().id(sportId).name("Badminton").isActive(true)
                .attributesSchema(stored).build()

        when:
        def result = sportService.getAttributeSchema(sportId)

        then:
        1 * sportLookupCache.getActiveSportsById() >> [(sportId): sport]
        result.groups[0].key == "gear"
        result.groups[0].attributes[0].key == "racket"
        result.groups[0].attributes[0].type == SportAttributeType.STRING
    }

    def "getAttributeSchema returns null when the sport offers no attributes"() {
        given:
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Badminton").isActive(true).build()

        when:
        def result = sportService.getAttributeSchema(sportId)

        then:
        1 * sportLookupCache.getActiveSportsById() >> [(sportId): sport]
        result == null
    }

    def "getAttributeSchema treats a deactivated sport as not found"() {
        given: "A7 collapses inactive into 404 - the active-only cache is what enforces it here"
        def sportId = 1L

        when:
        sportService.getAttributeSchema(sportId)

        then:
        1 * sportLookupCache.getActiveSportsById() >> [:]
        thrown(ResourceNotFoundException)
    }

    def "replaceAttributeSchema stores a valid document and evicts the cache"() {
        given:
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Badminton").isActive(true).build()
        def schema = SportAttributeSchema.builder().defaultLocale("en").groups([
                SportAttributeGroup.builder().key("gear").label(["en": "Gear"]).isAvailable(true).order(1)
                        .attributes([SportAttributeDefinition.builder()
                                             .key("racket").label(["en": "Racket"])
                                             .type(SportAttributeType.STRING)
                                             .isAvailable(true).order(1).build()])
                        .build()
        ]).build()

        when:
        def result = sportService.replaceAttributeSchema(sportId, schema)

        then: "resolved from the repository, not the active-only cache, so an inactive sport stays editable"
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport saved ->
            assert saved.attributesSchema.groups[0].key == "gear"
            return saved
        }
        1 * sportLookupCache.evictAll()
        result.groups[0].attributes[0].key == "racket"
    }

    def "replaceAttributeSchema rejects an invalid document without writing anything"() {
        given: "duplicate leaf keys across groups - the invariant that keeps stored profiles flat"
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Badminton").isActive(true).build()
        def duplicate = { String groupKey ->
            SportAttributeGroup.builder().key(groupKey).label(["en": groupKey]).isAvailable(true).order(1)
                    .attributes([SportAttributeDefinition.builder()
                                         .key("racket").label(["en": "Racket"])
                                         .type(SportAttributeType.STRING)
                                         .isAvailable(true).order(1).build()])
                    .build()
        }
        def schema = SportAttributeSchema.builder().defaultLocale("en")
                .groups([duplicate("gear"), duplicate("other")]).build()

        when:
        sportService.replaceAttributeSchema(sportId, schema)

        then: "validation runs before save, so a bad paste never half-applies"
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        0 * sportRepository.save(_)
        0 * sportLookupCache.evictAll()
        thrown(BadRequestException)
    }

    def "replaceAttributeSchema clears the schema when given null"() {
        given:
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Badminton").isActive(true)
                .attributesSchema([groups: []]).build()

        when:
        def result = sportService.replaceAttributeSchema(sportId, null)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.save(_) >> { Sport saved ->
            assert saved.attributesSchema == null
            return saved
        }
        1 * sportLookupCache.evictAll()
        result == null
    }

    def "replaceAttributeSchema 404s for a sport that does not exist"() {
        when:
        sportService.replaceAttributeSchema(99L, null)

        then:
        1 * sportRepository.findById(99L) >> Optional.empty()
        0 * sportRepository.save(_)
        thrown(ResourceNotFoundException)
    }

    // --- A11: admin read of an inactive sport's schema, and the rename collision guard ---

    def "getAttributeSchemaForAdmin returns the document for a deactivated sport"() {
        given: "the exact case A9 left broken - the admin editor could write this schema but never read it back"
        def sportId = 1L
        def stored = [
                defaultLocale: "en",
                groups       : [[key       : "gear", label: [en: "Gear"], isAvailable: true, order: 1,
                                  attributes: [[key: "racket", label: [en: "Racket"], type: "STRING",
                                                isAvailable: true, order: 1]]]]
        ]
        def sport = Sport.builder().id(sportId).name("Tennis").isActive(false)
                .attributesSchema(stored).build()

        when:
        def result = sportService.getAttributeSchemaForAdmin(sportId)

        then: "resolved straight from the repository - the active-only cache is never consulted"
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        0 * sportLookupCache.getActiveSportsById()
        result.groups[0].attributes[0].key == "racket"
    }

    def "getAttributeSchemaForAdmin returns null when the sport offers no attributes"() {
        given:
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Tennis").isActive(false).build()

        when:
        def result = sportService.getAttributeSchemaForAdmin(sportId)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        result == null
    }

    def "getAttributeSchemaForAdmin throws when no sport has this id at all"() {
        given:
        def sportId = 99L

        when:
        sportService.getAttributeSchemaForAdmin(sportId)

        then:
        1 * sportRepository.findById(sportId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateSport rejects a rename onto a name another sport already holds"() {
        given: "without this guard the UNIQUE constraint on sports.name blew up at flush and reached the caller as a 500"
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Tennis").isActive(true).build()
        def request = UpdateSportRequest.builder().name("Badminton").build()

        when:
        sportService.updateSport(sportId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.existsByName("Badminton") >> true
        0 * sportRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateSport allows a rename to a name nothing else holds"() {
        given:
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Tennis").isActive(true).build()
        def request = UpdateSportRequest.builder().name("Padel").build()

        when:
        sportService.updateSport(sportId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * sportRepository.existsByName("Padel") >> false
        1 * sportRepository.save({ it.name == "Padel" }) >> sport
        1 * sportLookupCache.evictAll()
    }

    def "updateSport does not treat a sport keeping its own name as a collision"() {
        given: "re-sending the unchanged name is what a form that posts every field does"
        def sportId = 1L
        def sport = Sport.builder().id(sportId).name("Tennis").isActive(true).build()
        def request = UpdateSportRequest.builder().name("Tennis").category("Racquet").build()

        when:
        sportService.updateSport(sportId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        0 * sportRepository.existsByName(_)
        1 * sportRepository.save(_) >> sport
        1 * sportLookupCache.evictAll()
    }

}

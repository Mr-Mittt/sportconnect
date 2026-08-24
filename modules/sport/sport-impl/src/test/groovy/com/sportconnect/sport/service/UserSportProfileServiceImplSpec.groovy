package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest
import com.sportconnect.sport.api.dto.SportAttributeDefinition
import com.sportconnect.sport.api.dto.SportAttributeGroup
import com.sportconnect.sport.api.dto.SportAttributeSchema
import com.sportconnect.sport.api.dto.SportAttributeType
import com.sportconnect.sport.api.dto.SportResponse
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.entity.UserSportProfile
import com.sportconnect.sport.repository.UserSportProfileRepository
import spock.lang.Specification
import spock.lang.Subject

class UserSportProfileServiceImplSpec extends Specification {

    UserSportProfileRepository profileRepository = Mock()
    SportService sportService = Mock()
    // A7: sport lookups moved off sportRepository onto the cache-backed SportService (A5). The one
    // lookup needing a boolean rather than a throw reads SportLookupCache directly.
    SportLookupCache sportLookupCache = Mock()
    ObjectMapper objectMapper = new ObjectMapper()
    // A9: deliberately the real collaborator, not a Mock(). It is a pure function with no
    // dependencies, and mocking it would make every attribute assertion below prove only that the
    // mock was told what to return - exactly the class of test that let A7's bug survive.
    ProfileAttributeFilter attributeFilter = new ProfileAttributeFilter()

    @Subject
    UserSportProfileServiceImpl profileService =
            new UserSportProfileServiceImpl(profileRepository, sportService, sportLookupCache, objectMapper,
                    attributeFilter)

    /**
     * A9: a schema declaring the free-text keys these specs use. Needed because attributes are now
     * filtered against the sport's live schema on write - a key with no definition is dropped, so a
     * spec that wants an attribute to survive has to say the sport actually offers it.
     */
    private static SportAttributeSchema schemaWith(String... keys) {
        SportAttributeSchema.builder()
                .groups([SportAttributeGroup.builder()
                                 .key("general").label(["en": "General"]).isAvailable(true).order(1)
                                 .attributes(keys.toList().withIndex().collect { key, i ->
                                     SportAttributeDefinition.builder()
                                             .key(key).label(["en": key])
                                             .type(SportAttributeType.STRING)
                                             .isAvailable(true).order(i + 1).build()
                                 })
                                 .build()])
                .build()
    }

    def setup() {
        // A9 changed the premise of every attribute assertion in this spec. These cases predate A9
        // and use free-text keys (dominantHand, strokeStyle, blob) that no schema declared, so
        // without this the filter would drop all of them and the assertions would silently be
        // testing the drop path instead of what they were written to test. Giving the sport a schema
        // that offers those keys preserves each case's original intent. Individual tests can still
        // override this interaction to exercise the drop path deliberately.
        sportService.getAttributeSchema(_) >> schemaWith("dominantHand", "strokeStyle", "blob")
    }

    def "createProfile should create new profile successfully"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .skillLevel("Intermediate")
                .yearsOfExperience(3)
                .preferredPosition("Forward")
                .bio("Love playing basketball")
                .attributes(["dominantHand": "left"])
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Basketball")
                .build()

        def profile = UserSportProfile.builder()
                .id(1L)
                .userId(userId)
                .sportId(sportId)
                .skillLevel("Intermediate")
                .yearsOfExperience(3)
                .preferredPosition("Forward")
                .bio("Love playing basketball")
                .attributes(["dominantHand": "left"])
                .isActive(true)
                .build()

        when:
        def result = profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.empty()
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.attributes == ["dominantHand": "left"]
            return profile
        }
        result.userId == userId
        result.sportId == sportId
        result.skillLevel == "Intermediate"
        result.attributes == ["dominantHand": "left"]
    }

    def "createProfile should reject oversized attributes payload"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .skillLevel("Intermediate")
                .attributes(["blob": "x" * 5000])
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Basketball")
                .build()

        when:
        profileService.createProfile(userId, request)

        then: "the size check runs before the profile lookup, so an oversized payload costs no query"
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        0 * profileRepository.findByUserIdAndSportId(_, _)
        0 * profileRepository.save(_)
        thrown(BadRequestException)
    }

    def "createProfile should throw exception when sport not found"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> { throw new ResourceNotFoundException("Sport", "id", sportId) }
        thrown(ResourceNotFoundException)
    }

    def "createProfile should throw ResourceNotFoundException when sport is inactive"() {
        given: "A7 collapsed inactive into not-found — findByIdAndIsActiveTrue returns empty for"
        and: "a deactivated sport exactly as it does for one that never existed"
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> { throw new ResourceNotFoundException("Sport", "id", sportId) }
        0 * profileRepository.findByUserIdAndIsActiveTrue(_)
        0 * profileRepository.save(_)
        thrown(ResourceNotFoundException)
    }

    def "createProfile should throw exception when an ACTIVE profile already exists"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .build()

        def existing = UserSportProfile.builder()
                .id(7L).userId(userId).sportId(sportId).isActive(true).build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name("Basketball").isActive(true).build()
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.of(existing)
        0 * profileRepository.save(_)
        thrown(BadRequestException)
    }

    def "createProfile reactivates a soft-deleted profile instead of rejecting or inserting"() {
        given: "the user deleted this profile before; the row still holds the UNIQUE (user, sport) pair"
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .skillLevel("Advanced")
                .bio("back again")
                .attributes(["dominantHand": "right"])
                .build()

        def existing = UserSportProfile.builder()
                .id(7L).userId(userId).sportId(sportId)
                .skillLevel("Beginner").bio("stale").attributes(["dominantHand": "left"])
                .isActive(false)
                .build()

        when:
        def result = profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name("Basketball").isActive(true).build()
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.of(existing)

        and: "the same row is saved back, reactivated, with every field taken from the request"
        1 * profileRepository.save({ UserSportProfile p ->
            p.id == 7L &&
            p.isActive &&
            p.skillLevel == "Advanced" &&
            p.bio == "back again" &&
            p.attributes == ["dominantHand": "right"]
        }) >> { UserSportProfile p -> p }

        and: "no second row is created for the same pair"
        result.id == 7L
        noExceptionThrown()
    }

    def "createProfile does not inherit stale values from the deleted profile"() {
        given: "a request that omits the optional fields the old profile had set"
        def userId = UUID.randomUUID()
        def sportId = 1L
        def request = CreateUserSportProfileRequest.builder().sportId(sportId).build()

        def existing = UserSportProfile.builder()
                .id(7L).userId(userId).sportId(sportId)
                .skillLevel("Beginner").bio("stale").preferredPosition("Forward")
                .attributes(["dominantHand": "left"])
                .isActive(false)
                .build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name("Basketball").isActive(true).build()
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.of(existing)
        1 * profileRepository.save({ UserSportProfile p ->
            p.skillLevel == null && p.bio == null && p.preferredPosition == null && p.attributes == [:]
        }) >> { UserSportProfile p -> p }
    }

    def "getProfileById should return profile when found"() {
        given:
        def profileId = 1L
        def userId = UUID.randomUUID()
        def sportId = 1L

        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(userId)
                .sportId(sportId)
                .skillLevel("Advanced")
                .isActive(true)
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Tennis")
                .build()

        when:
        def result = profileService.getProfileById(profileId)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.of(profile)
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        result.id == profileId
        result.sportName == "Tennis"
    }

    def "getProfileById should throw exception when profile not found"() {
        given:
        def profileId = 1L

        when:
        profileService.getProfileById(profileId)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getUserProfiles should return all active profiles for user"() {
        given:
        def userId = UUID.randomUUID()
        def sportId1 = 1L
        def sportId2 = 2L

        def profiles = [
            UserSportProfile.builder().id(1L).userId(userId).sportId(sportId1).isActive(true).build(),
            UserSportProfile.builder().id(2L).userId(userId).sportId(sportId2).isActive(true).build()
        ]

        def sportsById = [
            (sportId1): SportResponse.builder().id(sportId1).name("Football").build(),
            (sportId2): SportResponse.builder().id(sportId2).name("Cricket").build()
        ]

        when:
        def result = profileService.getUserProfiles(userId)

        then:
        1 * profileRepository.findByUserIdAndIsActiveTrue(userId) >> profiles
        1 * sportService.getActiveSportsByIds([sportId1, sportId2]) >> sportsById
        result.size() == 2
        result*.sportName as Set == ["Football", "Cricket"] as Set
    }

    def "getUserProfiles should return an empty list without querying sports when user has no profiles"() {
        given:
        def userId = UUID.randomUUID()

        when:
        def result = profileService.getUserProfiles(userId)

        then:
        1 * profileRepository.findByUserIdAndIsActiveTrue(userId) >> []
        0 * sportService.getActiveSportsByIds(_)
        result.isEmpty()
    }

    def "getUserProfiles omits a profile whose sport is no longer active"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L

        def profiles = [
            UserSportProfile.builder().id(1L).userId(userId).sportId(sportId).isActive(true).build()
        ]

        when:
        def result = profileService.getUserProfiles(userId)

        then: "getActiveSportsByIds is active-only backed, so a deactivated sport is absent from the map"
        1 * profileRepository.findByUserIdAndIsActiveTrue(userId) >> profiles
        1 * sportService.getActiveSportsByIds([sportId]) >> [:]

        and: "the profile is dropped entirely, not surfaced with an Unknown placeholder name (A7)"
        result.isEmpty()
    }

    def "getUserProfileForSport should return specific profile"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L

        def profile = UserSportProfile.builder()
                .id(1L)
                .userId(userId)
                .sportId(sportId)
                .skillLevel("Expert")
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Badminton")
                .build()

        when:
        def result = profileService.getUserProfileForSport(userId, sportId)

        then:
        1 * profileRepository.findByUserIdAndSportIdAndIsActiveTrue(userId, sportId) >> Optional.of(profile)
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        result.userId == userId
        result.sportId == sportId
        result.sportName == "Badminton"
    }

    def "getUserProfileForSport should throw exception when profile not found"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = 1L

        when:
        profileService.getUserProfileForSport(userId, sportId)

        then:
        1 * profileRepository.findByUserIdAndSportIdAndIsActiveTrue(userId, sportId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateProfile should update all provided fields"() {
        given:
        def profileId = 1L
        def sportId = 1L
        def ownerId = UUID.randomUUID()

        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(sportId)
                .skillLevel("Beginner")
                .yearsOfExperience(1)
                .build()

        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .skillLevel("Intermediate")
                .yearsOfExperience(3)
                .preferredPosition("Midfielder")
                .bio("Improved a lot")
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Football")
                .build()

        when:
        def result = profileService.updateProfile(profileId, ownerId, request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.of(profile)
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.skillLevel == "Intermediate"
            assert savedProfile.yearsOfExperience == 3
            assert savedProfile.preferredPosition == "Midfielder"
            assert savedProfile.bio == "Improved a lot"
            return savedProfile
        }
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        result.skillLevel == "Intermediate"
    }

    def "updateProfile should merge new attribute keys without dropping existing ones"() {
        given:
        def profileId = 1L
        def sportId = 1L
        def ownerId = UUID.randomUUID()

        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(sportId)
                .skillLevel("Beginner")
                .attributes(["dominantHand": "left"])
                .build()

        def request = CreateUserSportProfileRequest.builder()
                .attributes(["strokeStyle": "freestyle"])
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Swimming")
                .build()

        when:
        def result = profileService.updateProfile(profileId, ownerId, request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.of(profile)
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.attributes == ["dominantHand": "left", "strokeStyle": "freestyle"]
            return savedProfile
        }
        1 * sportService.requireActiveSportById(sportId) >> SportResponse.builder().id(sportId).name(sport.name).isActive(true).build()
        result.attributes == ["dominantHand": "left", "strokeStyle": "freestyle"]
    }

    def "updateProfile should reject oversized attributes payload"() {
        given:
        def profileId = 1L
        def sportId = 1L
        def ownerId = UUID.randomUUID()

        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(sportId)
                .build()

        def request = CreateUserSportProfileRequest.builder()
                .attributes(["blob": "x" * 5000])
                .build()

        when:
        profileService.updateProfile(profileId, ownerId, request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateProfile should throw exception when profile not found"() {
        given:
        def profileId = 1L
        def request = new CreateUserSportProfileRequest()

        when:
        profileService.updateProfile(profileId, UUID.randomUUID(), request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateProfile should throw ForbiddenException when caller is not the owner"() {
        given:
        def profileId = 1L
        def ownerId = UUID.randomUUID()
        def otherUserId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(1L)
                .build()
        def request = new CreateUserSportProfileRequest()

        when:
        profileService.updateProfile(profileId, otherUserId, request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(ForbiddenException)
    }

    def "deleteProfile should soft delete profile"() {
        given:
        def profileId = 1L
        def ownerId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(1L)
                .isActive(true)
                .build()

        when:
        profileService.deleteProfile(profileId, ownerId)

        then:
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.isActive == false
            return savedProfile
        }
    }

    def "deleteProfile should throw exception when profile not found"() {
        given:
        def profileId = 1L

        when:
        profileService.deleteProfile(profileId, UUID.randomUUID())

        then:
        1 * profileRepository.findById(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "deleteProfile should throw ForbiddenException when caller is not the owner"() {
        given:
        def profileId = 1L
        def ownerId = UUID.randomUUID()
        def otherUserId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(1L)
                .isActive(true)
                .build()

        when:
        profileService.deleteProfile(profileId, otherUserId)

        then:
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(ForbiddenException)
    }
    // ---- A7: hasActiveProfileForActiveSport ----
    // Renamed from hasProfileForSport, which was a bare existsByUserIdAndSportId and checked
    // neither condition its own Javadoc promised. Both false-cases below were live bugs.

    def "hasActiveProfileForActiveSport returns true when both the profile and the sport are active"() {
        given:
        def userId = UUID.randomUUID()

        when:
        def result = profileService.hasActiveProfileForActiveSport(userId, 1L)

        then:
        1 * profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> true
        1 * sportLookupCache.getActiveSportsById() >> [(1L): Sport.builder().id(1L).build()]
        result
    }

    def "hasActiveProfileForActiveSport returns false for a soft-deleted profile, without looking up the sport"() {
        given: "the user deleted this profile — deleteProfile only flips isActive to false"
        def userId = UUID.randomUUID()

        when:
        def result = profileService.hasActiveProfileForActiveSport(userId, 1L)

        then: "&& short-circuits, so the sports table is never touched"
        1 * profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> false
        0 * sportLookupCache.getActiveSportsById()
        !result
    }

    def "hasActiveProfileForActiveSport returns false when the sport has been deactivated"() {
        given: "a profile created while the sport was still active"
        def userId = UUID.randomUUID()

        when:
        def result = profileService.hasActiveProfileForActiveSport(userId, 1L)

        then:
        1 * profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> true
        1 * sportLookupCache.getActiveSportsById() >> [:]
        !result
    }

    def "hasActiveProfileForActiveSport returns false rather than throwing for an unknown sport"() {
        given: "an unknown sportId is indistinguishable from a deactivated one here, by design"
        def userId = UUID.randomUUID()

        when:
        def result = profileService.hasActiveProfileForActiveSport(userId, 404L)

        then: "callers use this as a predicate, so a dangling sportId must not blow up"
        1 * profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, 404L) >> true
        1 * sportLookupCache.getActiveSportsById() >> [:]
        noExceptionThrown()
        !result
    }

    def "hasActiveProfileForActiveSport never uses the unfiltered exists query"() {
        given: "a regression guard — reverting to existsByUserIdAndSportId reopens the A7 bug"
        def userId = UUID.randomUUID()

        when:
        profileService.hasActiveProfileForActiveSport(userId, 1L)

        then:
        1 * profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> false
        0 * profileRepository.existsByUserIdAndSportId(_, _)
    }
    // ---- A7: a soft-deleted profile must not be reachable individually either ----

    def "getProfileById does not return a soft-deleted profile"() {
        given: "the active-scoped finder simply does not match the row"
        when:
        profileService.getProfileById(1L)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(1L) >> Optional.empty()
        0 * sportService.requireActiveSportById(_)
        thrown(ResourceNotFoundException)
    }

    def "getUserProfileForSport does not return a soft-deleted profile"() {
        given:
        def userId = UUID.randomUUID()

        when:
        profileService.getUserProfileForSport(userId, 1L)

        then:
        1 * profileRepository.findByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> Optional.empty()
        0 * sportService.requireActiveSportById(_)
        thrown(ResourceNotFoundException)
    }

    def "getUserProfileForSport gates on sport status, not just the sport name"() {
        given: "an active profile whose sport was later deactivated"
        def userId = UUID.randomUUID()
        def profile = UserSportProfile.builder().id(1L).userId(userId).sportId(1L).isActive(true).build()

        when:
        profileService.getUserProfileForSport(userId, 1L)

        then: "requireActiveSportById throws — proving the call is a gate, not a name lookup"
        1 * profileRepository.findByUserIdAndSportIdAndIsActiveTrue(userId, 1L) >> Optional.of(profile)
        1 * sportService.requireActiveSportById(1L) >> { throw new ResourceNotFoundException("Sport", "id", 1L) }
        thrown(ResourceNotFoundException)
    }

    def "updateProfile does not edit a soft-deleted profile"() {
        when:
        profileService.updateProfile(1L, UUID.randomUUID(), CreateUserSportProfileRequest.builder().build())

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(1L) >> Optional.empty()
        0 * profileRepository.save(_)
        thrown(ResourceNotFoundException)
    }
    def "updateProfile rejects a profile whose sport was deactivated, without writing anything"() {
        given: "the gate must fire BEFORE any mutation - not at the tail, where only transaction"
        and: "rollback would have saved us"
        def callerId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(1L).userId(callerId).sportId(1L).skillLevel("Beginner").isActive(true).build()
        def request = CreateUserSportProfileRequest.builder().skillLevel("Advanced").build()

        when:
        profileService.updateProfile(1L, callerId, request)

        then:
        1 * profileRepository.findByIdAndIsActiveTrue(1L) >> Optional.of(profile)
        1 * sportService.requireActiveSportById(1L) >> { throw new ResourceNotFoundException("Sport", "id", 1L) }

        and: "save is never reached at all"
        0 * profileRepository.save(_)

        and: "and the entity was not mutated on the way to the throw"
        profile.skillLevel == "Beginner"

        and:
        thrown(ResourceNotFoundException)
    }
}
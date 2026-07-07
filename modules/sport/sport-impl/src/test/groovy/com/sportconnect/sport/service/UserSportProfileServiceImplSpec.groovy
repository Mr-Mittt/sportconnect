package com.sportconnect.sport.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.entity.UserSportProfile
import com.sportconnect.sport.repository.SportRepository
import com.sportconnect.sport.repository.UserSportProfileRepository
import spock.lang.Specification
import spock.lang.Subject

class UserSportProfileServiceImplSpec extends Specification {

    UserSportProfileRepository profileRepository = Mock()
    SportRepository sportRepository = Mock()
    ObjectMapper objectMapper = new ObjectMapper()

    @Subject
    UserSportProfileServiceImpl profileService = new UserSportProfileServiceImpl(profileRepository, sportRepository, objectMapper)

    def "createProfile should create new profile successfully"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
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
                .id(UUID.randomUUID())
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
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * profileRepository.existsByUserIdAndSportId(userId, sportId) >> false
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
        def sportId = UUID.randomUUID()
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

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * profileRepository.existsByUserIdAndSportId(userId, sportId) >> false
        0 * profileRepository.save(_)
        thrown(BadRequestException)
    }

    def "createProfile should throw exception when sport not found"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "createProfile should throw exception when profile already exists"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
        def request = CreateUserSportProfileRequest.builder()
                .sportId(sportId)
                .build()

        def sport = Sport.builder()
                .id(sportId)
                .name("Basketball")
                .build()

        when:
        profileService.createProfile(userId, request)

        then:
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        1 * profileRepository.existsByUserIdAndSportId(userId, sportId) >> true
        thrown(BadRequestException)
    }

    def "getProfileById should return profile when found"() {
        given:
        def profileId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()

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
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        result.id == profileId
        result.sportName == "Tennis"
    }

    def "getProfileById should throw exception when profile not found"() {
        given:
        def profileId = UUID.randomUUID()

        when:
        profileService.getProfileById(profileId)

        then:
        1 * profileRepository.findById(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getUserProfiles should return all active profiles for user"() {
        given:
        def userId = UUID.randomUUID()
        def sportId1 = UUID.randomUUID()
        def sportId2 = UUID.randomUUID()

        def profiles = [
            UserSportProfile.builder().id(UUID.randomUUID()).userId(userId).sportId(sportId1).isActive(true).build(),
            UserSportProfile.builder().id(UUID.randomUUID()).userId(userId).sportId(sportId2).isActive(true).build()
        ]

        def sport1 = Sport.builder().id(sportId1).name("Football").build()
        def sport2 = Sport.builder().id(sportId2).name("Cricket").build()

        when:
        def result = profileService.getUserProfiles(userId)

        then:
        1 * profileRepository.findByUserIdAndIsActiveTrue(userId) >> profiles
        1 * sportRepository.findAllById([sportId1, sportId2]) >> [sport1, sport2]
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
        0 * sportRepository.findAllById(_)
        result.isEmpty()
    }

    def "getUserProfileForSport should return specific profile"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()

        def profile = UserSportProfile.builder()
                .id(UUID.randomUUID())
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
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.of(profile)
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        result.userId == userId
        result.sportId == sportId
        result.sportName == "Badminton"
    }

    def "getUserProfileForSport should throw exception when profile not found"() {
        given:
        def userId = UUID.randomUUID()
        def sportId = UUID.randomUUID()

        when:
        profileService.getUserProfileForSport(userId, sportId)

        then:
        1 * profileRepository.findByUserIdAndSportId(userId, sportId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateProfile should update all provided fields"() {
        given:
        def profileId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
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
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.skillLevel == "Intermediate"
            assert savedProfile.yearsOfExperience == 3
            assert savedProfile.preferredPosition == "Midfielder"
            assert savedProfile.bio == "Improved a lot"
            return savedProfile
        }
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        result.skillLevel == "Intermediate"
    }

    def "updateProfile should merge new attribute keys without dropping existing ones"() {
        given:
        def profileId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
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
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        1 * profileRepository.save(_) >> { UserSportProfile savedProfile ->
            assert savedProfile.attributes == ["dominantHand": "left", "strokeStyle": "freestyle"]
            return savedProfile
        }
        1 * sportRepository.findById(sportId) >> Optional.of(sport)
        result.attributes == ["dominantHand": "left", "strokeStyle": "freestyle"]
    }

    def "updateProfile should reject oversized attributes payload"() {
        given:
        def profileId = UUID.randomUUID()
        def sportId = UUID.randomUUID()
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
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateProfile should throw exception when profile not found"() {
        given:
        def profileId = UUID.randomUUID()
        def request = new CreateUserSportProfileRequest()

        when:
        profileService.updateProfile(profileId, UUID.randomUUID(), request)

        then:
        1 * profileRepository.findById(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateProfile should throw ForbiddenException when caller is not the owner"() {
        given:
        def profileId = UUID.randomUUID()
        def ownerId = UUID.randomUUID()
        def otherUserId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(UUID.randomUUID())
                .build()
        def request = new CreateUserSportProfileRequest()

        when:
        profileService.updateProfile(profileId, otherUserId, request)

        then:
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(ForbiddenException)
    }

    def "deleteProfile should soft delete profile"() {
        given:
        def profileId = UUID.randomUUID()
        def ownerId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(UUID.randomUUID())
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
        def profileId = UUID.randomUUID()

        when:
        profileService.deleteProfile(profileId, UUID.randomUUID())

        then:
        1 * profileRepository.findById(profileId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "deleteProfile should throw ForbiddenException when caller is not the owner"() {
        given:
        def profileId = UUID.randomUUID()
        def ownerId = UUID.randomUUID()
        def otherUserId = UUID.randomUUID()
        def profile = UserSportProfile.builder()
                .id(profileId)
                .userId(ownerId)
                .sportId(UUID.randomUUID())
                .isActive(true)
                .build()

        when:
        profileService.deleteProfile(profileId, otherUserId)

        then:
        1 * profileRepository.findById(profileId) >> Optional.of(profile)
        0 * profileRepository.save(_)
        thrown(ForbiddenException)
    }
}

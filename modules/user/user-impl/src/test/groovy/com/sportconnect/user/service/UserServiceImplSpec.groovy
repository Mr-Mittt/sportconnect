package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.api.dto.CountryResponse
import com.sportconnect.reference.api.dto.RegionResponse
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.dto.UserSportProfileResponse
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.FriendRequestResponse
import com.sportconnect.user.api.dto.LocationRequest
import com.sportconnect.user.api.dto.UpdateProfileRequest
import com.sportconnect.user.api.dto.UserFriendshipStatus
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.Role
import com.sportconnect.user.api.dto.UserRegistrationDetails
import com.sportconnect.user.entity.User
import com.sportconnect.user.entity.UserPreference
import com.sportconnect.user.repository.RoleRepository
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.locationtech.jts.geom.Coordinate
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.geom.PrecisionModel
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.redis.connection.stream.MapRecord
import org.springframework.data.redis.core.StreamOperations
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDate

class UserServiceImplSpec extends Specification {

    UserRepository userRepository = Mock()
    RoleRepository roleRepository = Mock()
    PasswordEncoder passwordEncoder = Mock()
    UserFriendService userFriendService = Mock()
    AuthService authService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ReferenceService referenceService = Mock()
    UserPreferenceRepository userPreferenceRepository = Mock()
    // Real instance, not a Mock() — a pure value-converter with no side effects, and using the
    // real one lets tests assert on the actual serialized payload publishDomainEvent produces.
    ObjectMapper objectMapper = new ObjectMapper()
    GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326)

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, roleRepository, passwordEncoder, userFriendService, authService, userSportProfileService, stringRedisTemplate, objectMapper, referenceService, userPreferenceRepository)

    def "getUserById should return user when found and active"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("John")
                .lastName("Doe")
                .username("johndoe")
                .isActive(true)
                .roles([new Role(id: 1, name: "USER")] as Set)
                .build()

        when:
        def result = userService.getUserById(userId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        result.id == userId
        result.email == "test@example.com"
        result.firstName == "John"
        result.lastName == "Doe"
    }

    def "getUserById should throw exception when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.getUserById(userId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    // U12: same contract as getUserById, but via the PESSIMISTIC_READ-locked query — used by
    // AuthServiceImpl.refreshToken() so a concurrent deactivation can't race it.
    def "getActiveUserForUpdate should return user when found and active"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        def result = userService.getActiveUserForUpdate(userId)

        then:
        1 * userRepository.findByIdAndIsActiveTrueForShare(userId) >> Optional.of(user)
        result.id == userId
    }

    def "getActiveUserForUpdate should throw exception when user not found or inactive"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.getActiveUserForUpdate(userId)

        then:
        1 * userRepository.findByIdAndIsActiveTrueForShare(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getUserByEmail should return user when found"() {
        given:
        def email = "test@example.com"
        def user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .username("testuser")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        def result = userService.getUserByEmail(email)

        then:
        1 * userRepository.findByEmailAndIsActiveTrue(email) >> Optional.of(user)
        result.email == email
    }

    def "getUserByEmail should throw exception when user not found"() {
        given:
        def email = "notfound@example.com"

        when:
        userService.getUserByEmail(email)

        then:
        1 * userRepository.findByEmailAndIsActiveTrue(email) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getUserByEmail should throw exception when user is soft-deleted"() {
        given:
        def email = "deleted@example.com"

        when:
        userService.getUserByEmail(email)

        then:
        1 * userRepository.findByEmailAndIsActiveTrue(email) >> Optional.empty()
        0 * userRepository.findByEmail(_)
        thrown(ResourceNotFoundException)
    }

    def "getUserByUsername should return user when found"() {
        given:
        def username = "johndoe"
        def user = User.builder()
                .id(UUID.randomUUID())
                .email("john@example.com")
                .username(username)
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        def result = userService.getUserByUsername(username)

        then:
        1 * userRepository.findByUsernameAndIsActiveTrue(username) >> Optional.of(user)
        result.username == username
    }

    def "getUserByUsername should throw exception when user is soft-deleted"() {
        given:
        def username = "deleteduser"

        when:
        userService.getUserByUsername(username)

        then:
        1 * userRepository.findByUsernameAndIsActiveTrue(username) >> Optional.empty()
        0 * userRepository.findByUsername(_)
        thrown(ResourceNotFoundException)
    }

    // ---- U15: toPublicUserInfo ----

    def "toPublicUserInfo maps the user's active sport ids onto the PII-free response"() {
        given:
        def userId = UUID.randomUUID()
        def user = UserResponse.builder()
                .id(userId)
                .firstName("Target")
                .lastName("User")
                .username("target")
                .avatarUrl("https://example.com/a.png")
                .coverUrl("https://example.com/c.png")
                .bio("Weekend baller.")
                .build()

        when:
        def result = userService.toPublicUserInfo(user)

        then:
        1 * userSportProfileService.getUserProfiles(userId) >> [
                UserSportProfileResponse.builder().sportId(7L).build(),
                UserSportProfileResponse.builder().sportId(3L).build()
        ]
        result.id == userId
        result.fullName == "Target User"
        result.username == "target"
        result.bio == "Weekend baller."
        result.activeSportIds as Set == [7L, 3L] as Set
    }

    def "toPublicUserInfo returns an empty activeSportIds list when the user has no active profiles"() {
        given:
        def user = UserResponse.builder().id(UUID.randomUUID()).firstName("No").lastName("Sports").build()

        when:
        def result = userService.toPublicUserInfo(user)

        then:
        1 * userSportProfileService.getUserProfiles(user.id) >> []
        result.activeSportIds == []
    }

    def "toPublicUserInfo de-duplicates sport ids"() {
        given:
        def user = UserResponse.builder().id(UUID.randomUUID()).firstName("Dup").lastName("User").build()

        when:
        def result = userService.toPublicUserInfo(user)

        then:
        1 * userSportProfileService.getUserProfiles(user.id) >> [
                UserSportProfileResponse.builder().sportId(5L).build(),
                UserSportProfileResponse.builder().sportId(5L).build()
        ]
        result.activeSportIds == [5L]
    }

    def "UserInfoResponse.of(user) one-arg overload yields a non-null empty activeSportIds"() {
        expect:
        com.sportconnect.user.api.dto.UserInfoResponse
                .of(UserResponse.builder().id(UUID.randomUUID()).build())
                .activeSportIds == []
    }

    def "updateProfile should update all fields when provided"() {
        given:
        referenceService.getCountriesByIds(_) >> [:]
        referenceService.getRegionsByIds(_) >> [:]
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("old@example.com")
                .firstName("Old")
                .lastName("Name")
                .isActive(true)
                .roles([] as Set)
                .build()

        def request = UpdateProfileRequest.builder()
                .firstName("New")
                .lastName("Name")
                .username("newusername")
                .phoneNumber("+1234567890")
                .dateOfBirth(LocalDate.of(1990, 1, 1))
                .gender("MALE")
                .bio("Updated bio")
                .avatarUrl("https://example.com/avatar.jpg")
                .coverUrl("https://example.com/cover.jpg")
                .city("New York")
                .countryId(7L)
                .regionId(80L)
                .build()

        when:
        def result = userService.updateProfile(userId, userId, request)

        then:
        1 * referenceService.requireValidSelection(7L, 80L)
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.firstName == "New"
            assert savedUser.lastName == "Name"
            assert savedUser.username == "newusername"
            assert savedUser.phoneNumber == "+1234567890"
            assert savedUser.gender == "MALE"
            assert savedUser.bio == "Updated bio"
            assert savedUser.city == "New York"
            assert savedUser.countryId == 7L
            assert savedUser.regionId == 80L
            return savedUser
        }
        result.firstName == "New"
    }

    def "updateProfile publishes a user.profile_updated event when a displayable field changes"() {
        // Regression coverage for services/chat's sync mechanism, added 2026-07-27 — the
        // conditional-publish logic (only fires when a displayable field actually changed) had no
        // test at all before this; see services/chat/docs/SYNC_DESIGN.md.
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId).email("old@example.com").firstName("Old").lastName("Name")
                .isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder()
                .firstName("New").lastName("Name").username("newusername")
                .avatarUrl("https://example.com/avatar.jpg").build()
        def streamOps = Mock(StreamOperations)

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser -> savedUser }

        and: "a user.profile_updated event is published with the new values"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'user.profile_updated' &&
                    payload['user_id'] == userId.toString() &&
                    payload['full_name'] == 'New Name' &&
                    payload['username'] == 'newusername' &&
                    payload['avatar_url'] == 'https://example.com/avatar.jpg'
        })
    }

    def "updateProfile does not publish an event when only non-displayable fields change"() {
        // The other half of the conditional-publish logic — omitting this direction meant a
        // future bug that fires on EVERY save (not just displayable-field changes) would have
        // gone uncaught.
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId).email("test@example.com").firstName("Same").lastName("Name")
                .username("sameusername").avatarUrl("https://example.com/same.jpg")
                .isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder()
                .bio("A new bio").phoneNumber("+1234567890").city("New York").build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser -> savedUser }

        and: "no event is published — none of the displayable fields changed"
        0 * stringRedisTemplate.opsForStream()
    }

    def "updateProfile stores #sent as #stored (U20)"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId).email("test@example.com").gender(existing)
                .isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().gender(sent).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.gender == stored
            return savedUser
        }

        where:
        sent     | existing | stored
        "MALE"   | null     | "MALE"
        "FEMALE" | "MALE"   | "FEMALE"
        ""       | "FEMALE" | null      // empty string clears
        null     | "FEMALE" | "FEMALE"  // null = skip, existing value untouched
    }

    def "updateProfile rejects gender '#sent' with a BadRequestException and saves nothing (U20)"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId).email("test@example.com").firstName("Old").gender("MALE")
                .isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().firstName("New").gender(sent).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        def e = thrown(BadRequestException)
        e.message == "gender must be one of: MALE, FEMALE"
        e.errorCode == "GENDER_INVALID"
        e.errorParams == [allowed: ["MALE", "FEMALE"]]
        0 * userRepository.save(_)

        and: "validated before any field was applied"
        user.firstName == "Old"
        user.gender == "MALE"

        where:
        sent << ["male", "Female", "asdf", " MALE", "OTHER", "M"]
    }

    def "updateProfile should update physical stats when provided within bounds"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([] as Set)
                .build()

        def request = UpdateProfileRequest.builder()
                .heightCm(180)
                .weightKg(new BigDecimal("75.50"))
                .shoeSizeMm(270)
                .build()

        when:
        def result = userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.heightCm == 180
            assert savedUser.weightKg == new BigDecimal("75.50")
            assert savedUser.shoeSizeMm == 270
            return savedUser
        }
        result.heightCm == 180
        result.weightKg == new BigDecimal("75.50")
        result.shoeSizeMm == 270
    }

    def "updateProfile leaves physical stats unchanged when omitted"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .heightCm(170)
                .weightKg(new BigDecimal("65.00"))
                .shoeSizeMm(250)
                .isActive(true)
                .roles([] as Set)
                .build()

        def request = UpdateProfileRequest.builder().firstName("New").build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.heightCm == 170
            assert savedUser.weightKg == new BigDecimal("65.00")
            assert savedUser.shoeSizeMm == 250
            return savedUser
        }
    }

    def "updateProfile throws BadRequestException when heightCm is out of bounds"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder().id(userId).email("test@example.com").isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().heightCm(heightValue).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "HEIGHT_OUT_OF_RANGE"
        e.errorParams == [min: 50, max: 300]

        where:
        heightValue << [49, 301]
    }

    def "updateProfile throws BadRequestException when weightKg is out of bounds"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder().id(userId).email("test@example.com").isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().weightKg(weightValue).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "WEIGHT_OUT_OF_RANGE"
        e.errorParams == [min: 20, max: 300]

        where:
        weightValue << [new BigDecimal("19.99"), new BigDecimal("300.01")]
    }

    def "updateProfile throws BadRequestException when shoeSizeMm is out of bounds (millimetres, 10-500)"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder().id(userId).email("test@example.com").isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().shoeSizeMm(shoeSizeValue).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "SHOE_SIZE_OUT_OF_RANGE"
        e.errorParams == [min: 10, max: 500]
        e.message == "shoeSizeMm must be between 10 and 500"

        where:
        shoeSizeValue << [9, 501]
    }

    def "updateProfile should update location when provided"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([] as Set)
                .build()

        def locationRequest = new LocationRequest(latitude: 40.7128, longitude: -74.0060)
        def request = UpdateProfileRequest.builder()
                .location(locationRequest)
                .build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.location != null
            assert savedUser.location.y == 40.7128
            assert savedUser.location.x == -74.0060
            return savedUser
        }
    }

    def "updateProfile should throw exception when user not found"() {
        given:
        def userId = UUID.randomUUID()
        def request = new UpdateProfileRequest()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "updateProfile should throw ForbiddenException when caller is not the target user"() {
        given:
        def userId = UUID.randomUUID()
        def callerId = UUID.randomUUID()
        def request = new UpdateProfileRequest()

        when:
        userService.updateProfile(userId, callerId, request)

        then:
        0 * userRepository.findByIdAndIsActiveTrue(_)
        0 * userRepository.save(_)
        def e = thrown(ForbiddenException)
        e.errorCode == "USER_PROFILE_NOT_OWNED"
    }

    def "deleteUser should soft delete user"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.deleteUser(userId)

        then:
        1 * userRepository.findByIdForUpdate(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.isActive == false
            return savedUser
        }
        // U12: deactivation must also revoke the user's sessions, not just flip isActive.
        1 * authService.logout(userId)
    }

    def "deleteUser should throw exception when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.deleteUser(userId)

        then:
        1 * userRepository.findByIdForUpdate(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
        0 * authService.logout(_)
    }

    def "existsByEmail should return true when email exists"() {
        given:
        def email = "exists@example.com"

        when:
        def result = userService.existsByEmail(email)

        then:
        1 * userRepository.existsByEmail(email) >> true
        result == true
    }

    def "existsByEmail should return false when email does not exist"() {
        given:
        def email = "notexists@example.com"

        when:
        def result = userService.existsByEmail(email)

        then:
        1 * userRepository.existsByEmail(email) >> false
        result == false
    }

    def "existsByUsername should return true when username exists"() {
        given:
        def username = "existinguser"

        when:
        def result = userService.existsByUsername(username)

        then:
        1 * userRepository.existsByUsername(username) >> true
        result == true
    }

    def "existsByUsername should return false when username does not exist"() {
        given:
        def username = "newuser"

        when:
        def result = userService.existsByUsername(username)

        then:
        1 * userRepository.existsByUsername(username) >> false
        result == false
    }

    def "toUserResponse should correctly map user with location"() {
        given:
        def userId = UUID.randomUUID()
        def point = geometryFactory.createPoint(new Coordinate(-74.0060, 40.7128))
        def role = new Role(id: 1, name: "USER")
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("John")
                .lastName("Doe")
                .username("johndoe")
                .location(point)
                .city("New York")
                .country("USA")
                .isEmailVerified(true)
                .isActive(true)
                .roles([role] as Set)
                .build()

        when:
        def result = userService.getUserById(userId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        result.location != null
        result.location.latitude == 40.7128
        result.location.longitude == -74.0060
        result.city == "New York"
        result.country == "USA"
        result.roles.contains("USER")
    }

    def "changePassword updates the hash when currentPassword matches"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .passwordHash("oldHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.changePassword(userId, "oldRaw", "newRaw12345")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * passwordEncoder.matches("oldRaw", "oldHash") >> true
        1 * passwordEncoder.encode("newRaw12345") >> "newHash"
        1 * userRepository.save({ User u -> u.passwordHash == "newHash" }) >> user
    }

    def "changePassword throws BadRequestException when currentPassword does not match"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .passwordHash("oldHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.changePassword(userId, "wrongRaw", "newRaw12345")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * passwordEncoder.matches("wrongRaw", "oldHash") >> false
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "CURRENT_PASSWORD_INCORRECT"
    }

    def "changePassword throws ResourceNotFoundException when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.changePassword(userId, "oldRaw", "newRaw12345")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.empty()
        0 * userRepository.save(_)
        thrown(ResourceNotFoundException)
    }

    def "changePassword allows newPassword identical to currentPassword"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .passwordHash("oldHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.changePassword(userId, "samePassword", "samePassword")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * passwordEncoder.matches("samePassword", "oldHash") >> true
        1 * passwordEncoder.encode("samePassword") >> "sameHash"
        1 * userRepository.save(_) >> user
    }

    // ── createUser ────────────────────────────────────────────────────────────

    def "createUser assigns the default USER role and saves the new user"() {
        given:
        def userRole = new Role(id: 1, name: "USER")
        def savedUser = User.builder()
                .id(UUID.randomUUID())
                .email("new@example.com")
                .passwordHash("hashedPw")
                .firstName("New")
                .lastName("User")
                .phoneNumber("+1234567890")
                .isEmailVerified(false)
                .isActive(true)
                .roles([userRole] as Set)
                .build()

        when:
        def result = userService.createUser("new@example.com", "hashedPw", "New", "User", "+1234567890")

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(userRole)
        1 * userRepository.save({ User u ->
            u.email == "new@example.com" &&
            u.passwordHash == "hashedPw" &&
            u.isActive == true &&
            u.isEmailVerified == false &&
            u.roles.contains(userRole)
        }) >> savedUser
        result.email == "new@example.com"
        result.roles.contains("USER")
    }

    def "createUser throws RuntimeException when the USER role is missing"() {
        when:
        userService.createUser("new@example.com", "hashedPw", "New", "User", "+1234567890")

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.empty()
        0 * userRepository.save(_)
        thrown(RuntimeException)
    }

    // ── updateUserPassword ───────────────────────────────────────────────────

    def "updateUserPassword persists the given hash as-is without re-hashing"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .passwordHash("oldHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.updateUserPassword(userId, "alreadyHashedValue")

        then:
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * userRepository.save({ User u -> u.passwordHash == "alreadyHashedValue" }) >> user
        0 * passwordEncoder.encode(_)
    }

    def "updateUserPassword throws ResourceNotFoundException when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.updateUserPassword(userId, "alreadyHashedValue")

        then:
        1 * userRepository.findById(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    // ── getUserRoles ─────────────────────────────────────────────────────────

    def "getUserRoles returns the correct set of role names"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([new Role(id: 1, name: "USER"), new Role(id: 2, name: "ADMIN")] as Set)
                .build()

        when:
        def result = userService.getUserRoles(userId)

        then:
        1 * userRepository.findById(userId) >> Optional.of(user)
        result == ["USER", "ADMIN"] as Set
    }

    def "getUserRoles throws ResourceNotFoundException when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.getUserRoles(userId)

        then:
        1 * userRepository.findById(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    // ── verifyPassword ───────────────────────────────────────────────────────

    def "verifyPassword returns true when password matches an active user"() {
        given:
        def email = "test@example.com"
        def user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .passwordHash("storedHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        def result = userService.verifyPassword(email, "rawPassword")

        then:
        1 * userRepository.findByEmail(email) >> Optional.of(user)
        1 * passwordEncoder.matches("rawPassword", "storedHash") >> true
        result == true
    }

    def "verifyPassword returns false when password does not match"() {
        given:
        def email = "test@example.com"
        def user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .passwordHash("storedHash")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        def result = userService.verifyPassword(email, "wrongPassword")

        then:
        1 * userRepository.findByEmail(email) >> Optional.of(user)
        1 * passwordEncoder.matches("wrongPassword", "storedHash") >> false
        result == false
    }

    def "verifyPassword returns false for an inactive (soft-deleted) user without checking the hash"() {
        given:
        def email = "deleted@example.com"
        def user = User.builder()
                .id(UUID.randomUUID())
                .email(email)
                .passwordHash("storedHash")
                .isActive(false)
                .roles([] as Set)
                .build()

        when:
        def result = userService.verifyPassword(email, "rawPassword")

        then:
        1 * userRepository.findByEmail(email) >> Optional.of(user)
        0 * passwordEncoder.matches(_, _)
        result == false
    }

    def "verifyPassword returns false when user does not exist"() {
        given:
        def email = "notfound@example.com"

        when:
        def result = userService.verifyPassword(email, "rawPassword")

        then:
        1 * userRepository.findByEmail(email) >> Optional.empty()
        0 * passwordEncoder.matches(_, _)
        result == false
    }

    // ── updateLastLogin ──────────────────────────────────────────────────────

    def "updateLastLogin sets lastLoginAt to now"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .isActive(true)
                .roles([] as Set)
                .build()

        when:
        userService.updateLastLogin(userId)

        then:
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * userRepository.save({ User u -> u.lastLoginAt != null }) >> user
    }

    def "updateLastLogin throws ResourceNotFoundException when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.updateLastLogin(userId)

        then:
        1 * userRepository.findById(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    // ── searchUsers ──────────────────────────────────────────────────────────

    private User searchResultUser(UUID id, String firstName, String lastName, String username) {
        User.builder()
                .id(id)
                .email("${username}@example.com")
                .firstName(firstName)
                .lastName(lastName)
                .username(username)
                .city("Hanoi")
                .country("Vietnam")
                .isActive(true)
                .roles([] as Set)
                .build()
    }

    def "searchUsers returns matches with NONE friendship status by default"() {
        given:
        def callerId = UUID.randomUUID()
        def otherId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([searchResultUser(otherId, "Jane", "Doe", "janedoe")])

        when:
        def result = userService.searchUsers(callerId, "jane", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> []
        1 * userFriendService.getPendingSentRequests(callerId) >> []
        1 * userFriendService.getPendingReceivedRequests(callerId) >> []
        result.content.size() == 1
        result.content[0].fullName == "Jane Doe"
        result.content[0].username == "janedoe"
        result.content[0].city == "Hanoi"
        result.content[0].friendshipStatus == UserFriendshipStatus.NONE
    }

    def "searchUsers marks accepted friends as FRIENDS"() {
        given:
        def callerId = UUID.randomUUID()
        def friendId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([searchResultUser(friendId, "Jane", "Doe", "janedoe")])

        when:
        def result = userService.searchUsers(callerId, "jane", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> [friendId]
        1 * userFriendService.getPendingSentRequests(callerId) >> []
        1 * userFriendService.getPendingReceivedRequests(callerId) >> []
        result.content[0].friendshipStatus == UserFriendshipStatus.FRIENDS
    }

    def "searchUsers marks a pending sent request as PENDING_SENT"() {
        given:
        def callerId = UUID.randomUUID()
        def targetId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([searchResultUser(targetId, "Jane", "Doe", "janedoe")])
        def sentRequest = FriendRequestResponse.builder().senderId(callerId).receiverId(targetId).build()

        when:
        def result = userService.searchUsers(callerId, "jane", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> []
        1 * userFriendService.getPendingSentRequests(callerId) >> [sentRequest]
        1 * userFriendService.getPendingReceivedRequests(callerId) >> []
        result.content[0].friendshipStatus == UserFriendshipStatus.PENDING_SENT
    }

    def "searchUsers marks a pending received request as PENDING_RECEIVED"() {
        given:
        def callerId = UUID.randomUUID()
        def targetId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([searchResultUser(targetId, "Jane", "Doe", "janedoe")])
        def receivedRequest = FriendRequestResponse.builder().senderId(targetId).receiverId(callerId).build()

        when:
        def result = userService.searchUsers(callerId, "jane", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> []
        1 * userFriendService.getPendingSentRequests(callerId) >> []
        1 * userFriendService.getPendingReceivedRequests(callerId) >> [receivedRequest]
        result.content[0].friendshipStatus == UserFriendshipStatus.PENDING_RECEIVED
    }

    def "searchUsers falls back to username for fullName when names are missing"() {
        given:
        def callerId = UUID.randomUUID()
        def otherId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([searchResultUser(otherId, null, null, "janedoe")])

        when:
        def result = userService.searchUsers(callerId, "jane", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> []
        1 * userFriendService.getPendingSentRequests(callerId) >> []
        1 * userFriendService.getPendingReceivedRequests(callerId) >> []
        result.content[0].fullName == "janedoe"
    }

    def "searchUsers throws BadRequestException when keyword is blank"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        userService.searchUsers(callerId, "  ", pageable)

        then:
        0 * userRepository.searchActiveUsers(_, _, _)
        def e = thrown(BadRequestException)
        e.errorCode == "SEARCH_KEYWORD_TOO_SHORT"
    }

    def "searchUsers throws BadRequestException when keyword is shorter than 2 characters"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        userService.searchUsers(callerId, "j", pageable)

        then:
        0 * userRepository.searchActiveUsers(_, _, _)
        def e = thrown(BadRequestException)
        e.errorCode == "SEARCH_KEYWORD_TOO_SHORT"
        e.errorParams == [min: 2]
    }

    def "searchUsers trims the keyword before querying"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([])

        when:
        userService.searchUsers(callerId, "  jane  ", pageable)

        then:
        1 * userRepository.searchActiveUsers(callerId, "jane", pageable) >> page
        1 * userFriendService.getAcceptedFriendIds(callerId) >> []
        1 * userFriendService.getPendingSentRequests(callerId) >> []
        1 * userFriendService.getPendingReceivedRequests(callerId) >> []
    }

    // ══════════════════════════════════════════════════════════════════════
    // U16 — country / region / language links
    // ══════════════════════════════════════════════════════════════════════

    private static final Role USER_ROLE = new Role(id: 1, name: "USER")

    private User linkedUser(UUID id, Long countryId, Long regionId, String legacyCountry = null) {
        User.builder()
                .id(id).email("linked@example.com").firstName("Lin").lastName("Ked")
                .isActive(true).roles([USER_ROLE] as Set)
                .countryId(countryId).regionId(regionId).country(legacyCountry)
                .build()
    }

    private static CountryResponse country(Long id, String name) {
        CountryResponse.builder().id(id).iso2("VN").iso3("VNM").name(name).build()
    }

    private static RegionResponse region(Long id, String name) {
        RegionResponse.builder().id(id).countryId(7L).isoCode("VN-SG").name(name).nativeName(name).build()
    }

    // ---------- createUser with sign-up details ----------

    def "createUser with details validates first, then saves the ids, the location point and a preference row"() {
        given:
        def savedId = UUID.randomUUID()
        def details = UserRegistrationDetails.builder()
                .languageCode("vi").countryId(7L).regionId(80L).latitude(10.7769d).longitude(106.7009d).build()
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        referenceService.isActiveLanguage("vi") >> true
        referenceService.getCountriesByIds({ it as Set == [7L] as Set }) >> [(7L): country(7L, "Vietnam")]
        referenceService.getRegionsByIds({ it as Set == [80L] as Set }) >> [(80L): region(80L, "Ho Chi Minh")]

        when:
        def result = userService.createUser("geo@example.com", "hashedPw", "Geo", "User", null, details)

        then: "the selection is validated before anything is saved"
        1 * referenceService.requireValidSelection(7L, 80L)

        then: "the user carries the ids and a point with X = longitude, Y = latitude"
        1 * userRepository.save({ User u ->
            u.countryId == 7L && u.regionId == 80L &&
                    u.location.x == 106.7009d && u.location.y == 10.7769d && u.location.SRID == 4326
        }) >> { User u -> u.id = savedId; u }

        then: "a preference row holds the language"
        1 * userPreferenceRepository.save({ UserPreference p -> p.userId == savedId && p.language == "vi" }) >> { UserPreference p -> p }

        and: "the response resolves the display names"
        result.countryId == 7L
        result.regionId == 80L
        result.country == "Vietnam"
        result.regionName == "Ho Chi Minh"
    }

    def "createUser with no details is exactly the old behavior: an empty selection, no language check, no preference row, no point"() {
        given:
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)

        when:
        def result = userService.createUser("plain@example.com", "hashedPw", "Plain", "User", null)

        then:
        1 * referenceService.requireValidSelection(null, null)
        0 * referenceService.isActiveLanguage(_)
        1 * userRepository.save({ User u -> u.countryId == null && u.regionId == null && u.location == null }) >> { User u -> u.id = UUID.randomUUID(); u }
        0 * userPreferenceRepository.save(_)
        result.countryId == null
        result.country == null
    }

    def "createUser treats a blank language code as none"() {
        given:
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)

        when:
        userService.createUser("blank@example.com", "hashedPw", "B", "L", null, UserRegistrationDetails.builder().languageCode("   ").build())

        then:
        0 * referenceService.isActiveLanguage(_)
        1 * userRepository.save(_) >> { User u -> u.id = UUID.randomUUID(); u }
        0 * userPreferenceRepository.save(_)
    }

    def "createUser creates nothing when the country/region selection is invalid"() {
        given:
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        referenceService.requireValidSelection(7L, 999L) >> { throw new BadRequestException("Region 999 is unknown") }

        when:
        userService.createUser("bad@example.com", "hashedPw", "B", "R", null,
                UserRegistrationDetails.builder().countryId(7L).regionId(999L).languageCode("vi").build())

        then:
        thrown(BadRequestException)
        0 * userRepository.save(_)
        0 * userPreferenceRepository.save(_)
    }

    def "createUser creates nothing when the language is unknown or inactive"() {
        given:
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        referenceService.isActiveLanguage("zz") >> false

        when:
        userService.createUser("lang@example.com", "hashedPw", "L", "G", null, UserRegistrationDetails.builder().languageCode("zz").build())

        then:
        def e = thrown(BadRequestException)
        e.message.contains("zz")
        e.errorCode == "LANGUAGE_UNKNOWN"
        e.errorParams == [language: "zz"]
        0 * userRepository.save(_)
        0 * userPreferenceRepository.save(_)
    }

    def "createUser rejects a half-supplied or out-of-range coordinate pair and creates nothing"() {
        given:
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)

        when:
        userService.createUser("coord@example.com", "hashedPw", "C", "O", null,
                UserRegistrationDetails.builder().latitude(lat).longitude(lon).build())

        then:
        def e = thrown(BadRequestException)
        e.errorCode == code
        0 * userRepository.save(_)

        where:
        lat    | lon     | code
        10.7d  | null    | "LOCATION_INCOMPLETE"
        null   | 106.7d  | "LOCATION_INCOMPLETE"
        91.0d  | 0.0d    | "LOCATION_OUT_OF_RANGE"
        -90.5d | 0.0d    | "LOCATION_OUT_OF_RANGE"
        0.0d   | 181.0d  | "LOCATION_OUT_OF_RANGE"
        0.0d   | -180.5d | "LOCATION_OUT_OF_RANGE"
    }

    // ---------- updateProfile geo rules ----------

    def "updateProfile with a country sets both ids, and an absent regionId clears the stored region"() {
        given:
        referenceService.getCountriesByIds(_) >> [:]
        referenceService.getRegionsByIds(_) >> [:]
        def userId = UUID.randomUUID()
        def user = linkedUser(userId, 7L, 80L)

        when:
        userService.updateProfile(userId, userId, UpdateProfileRequest.builder().countryId(7L).build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * referenceService.requireValidSelection(7L, null)
        1 * userRepository.save({ User u -> u.countryId == 7L && u.regionId == null }) >> { User u -> u }
    }

    def "updateProfile with only a regionId validates it against the stored country"() {
        given:
        referenceService.getCountriesByIds(_) >> [:]
        referenceService.getRegionsByIds(_) >> [:]
        def userId = UUID.randomUUID()
        def user = linkedUser(userId, 7L, null)

        when:
        userService.updateProfile(userId, userId, UpdateProfileRequest.builder().regionId(80L).build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * referenceService.requireValidSelection(7L, 80L)
        1 * userRepository.save({ User u -> u.countryId == 7L && u.regionId == 80L }) >> { User u -> u }
    }

    def "updateProfile with a region but no stored country is rejected and saves nothing"() {
        given:
        def userId = UUID.randomUUID()
        def user = linkedUser(userId, null, null)
        referenceService.requireValidSelection(null, 80L) >> { throw new BadRequestException("A region cannot be selected without a country") }

        when:
        userService.updateProfile(userId, userId, UpdateProfileRequest.builder().regionId(80L).build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        thrown(BadRequestException)
        0 * userRepository.save(_)
    }

    def "updateProfile rejects an invalid selection before applying any other field"() {
        given:
        def userId = UUID.randomUUID()
        def user = linkedUser(userId, null, null)
        referenceService.requireValidSelection(99L, null) >> { throw new BadRequestException("Unknown or inactive country: 99") }

        when:
        userService.updateProfile(userId, userId, UpdateProfileRequest.builder().firstName("Changed").countryId(99L).build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        thrown(BadRequestException)
        user.firstName == "Lin"
        0 * userRepository.save(_)
    }

    def "updateProfile that names neither country nor region leaves the geo fields and the reference domain alone"() {
        given:
        referenceService.getCountriesByIds(_) >> [:]
        referenceService.getRegionsByIds(_) >> [:]
        def userId = UUID.randomUUID()
        def user = linkedUser(userId, 7L, 80L)

        when:
        userService.updateProfile(userId, userId, UpdateProfileRequest.builder().bio("only the bio").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        0 * referenceService.requireValidSelection(*_)
        1 * userRepository.save({ User u -> u.countryId == 7L && u.regionId == 80L && u.bio == "only the bio" }) >> { User u -> u }
    }

    // ---------- responses: resolved names, legacy fallback, batching ----------

    def "a single-user read resolves country and region names with one lookup each"() {
        given:
        def userId = UUID.randomUUID()
        userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(linkedUser(userId, 7L, 80L, "old text"))

        when:
        def result = userService.getUserById(userId)

        then:
        1 * referenceService.getCountriesByIds({ it as Set == [7L] as Set }) >> [(7L): country(7L, "Vietnam")]
        1 * referenceService.getRegionsByIds({ it as Set == [80L] as Set }) >> [(80L): region(80L, "Ho Chi Minh")]
        result.country == "Vietnam"       // the linked name wins over the legacy text
        result.countryId == 7L
        result.regionId == 80L
        result.regionName == "Ho Chi Minh"
    }

    def "a user with only legacy country text shows it, and the reference domain is not called at all"() {
        given:
        def userId = UUID.randomUUID()
        userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(linkedUser(userId, null, null, "Viet Nam (typed)"))

        when:
        def result = userService.getUserById(userId)

        then:
        0 * referenceService._
        result.country == "Viet Nam (typed)"
        result.countryId == null
        result.regionName == null
    }

    def "a linked id the reference domain cannot resolve falls back to the legacy text and a null region name"() {
        given:
        def userId = UUID.randomUUID()
        userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(linkedUser(userId, 7L, 80L, "legacy"))

        when:
        def result = userService.getUserById(userId)

        then:
        1 * referenceService.getCountriesByIds(_) >> [:]
        1 * referenceService.getRegionsByIds(_) >> [:]
        result.country == "legacy"
        result.countryId == 7L
        result.regionName == null
    }

    def "getUsersByIds sets the ids but deliberately does not call the reference domain (hot-path cost)"() {
        given:
        def a = linkedUser(UUID.randomUUID(), 7L, 80L, "legacy a")
        def b = linkedUser(UUID.randomUUID(), null, null, null)
        userRepository.findAllById(_) >> [a, b]

        when:
        def result = userService.getUsersByIds([a.id, b.id])

        then:
        0 * referenceService._
        result[a.id].countryId == 7L
        result[a.id].regionId == 80L
        result[a.id].country == "legacy a"   // unresolved: the legacy text, never a looked-up name
        result[a.id].regionName == null
        result[b.id].countryId == null
    }

    def "searchUsers resolves every country name on the page with ONE lookup, however many rows"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def u1 = linkedUser(UUID.randomUUID(), 7L, null)
        def u2 = linkedUser(UUID.randomUUID(), 7L, null)          // same country as u1: still one id
        def u3 = linkedUser(UUID.randomUUID(), 8L, null)
        def u4 = linkedUser(UUID.randomUUID(), null, null, "Typed Land")
        def u5 = linkedUser(UUID.randomUUID(), null, null, null)
        userRepository.searchActiveUsers(callerId, "lin", pageable) >> new PageImpl<>([u1, u2, u3, u4, u5])
        userFriendService.getAcceptedFriendIds(callerId) >> []
        userFriendService.getPendingSentRequests(callerId) >> []
        userFriendService.getPendingReceivedRequests(callerId) >> []

        when:
        def result = userService.searchUsers(callerId, "lin", pageable)

        then:
        1 * referenceService.getCountriesByIds({ it as Set == [7L, 8L] as Set }) >> [(7L): country(7L, "Vietnam"), (8L): country(8L, "Thailand")]
        0 * referenceService.getRegionsByIds(_)
        result.content*.country == ["Vietnam", "Vietnam", "Thailand", "Typed Land", null]
    }

    def "searchUsers makes no reference call when nobody on the page has a linked country"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        userRepository.searchActiveUsers(callerId, "lin", pageable) >> new PageImpl<>([linkedUser(UUID.randomUUID(), null, null, "Typed Land")])
        userFriendService.getAcceptedFriendIds(callerId) >> []
        userFriendService.getPendingSentRequests(callerId) >> []
        userFriendService.getPendingReceivedRequests(callerId) >> []

        when:
        def result = userService.searchUsers(callerId, "lin", pageable)

        then:
        0 * referenceService._
        result.content[0].country == "Typed Land"
    }
}

package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.api.dto.UserSportProfileResponse
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.FriendRequestResponse
import com.sportconnect.user.api.dto.LocationRequest
import com.sportconnect.user.api.dto.UpdateProfileRequest
import com.sportconnect.user.api.dto.UserFriendshipStatus
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.Role
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.RoleRepository
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
    // Real instance, not a Mock() — a pure value-converter with no side effects, and using the
    // real one lets tests assert on the actual serialized payload publishDomainEvent produces.
    ObjectMapper objectMapper = new ObjectMapper()
    GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326)

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, roleRepository, passwordEncoder, userFriendService, authService, userSportProfileService, stringRedisTemplate, objectMapper)

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
                .gender("Male")
                .bio("Updated bio")
                .avatarUrl("https://example.com/avatar.jpg")
                .coverUrl("https://example.com/cover.jpg")
                .city("New York")
                .country("USA")
                .build()

        when:
        def result = userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.firstName == "New"
            assert savedUser.lastName == "Name"
            assert savedUser.username == "newusername"
            assert savedUser.phoneNumber == "+1234567890"
            assert savedUser.gender == "Male"
            assert savedUser.bio == "Updated bio"
            assert savedUser.city == "New York"
            assert savedUser.country == "USA"
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
                .shoeSizeCm(27)
                .build()

        when:
        def result = userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.heightCm == 180
            assert savedUser.weightKg == new BigDecimal("75.50")
            assert savedUser.shoeSizeCm == 27
            return savedUser
        }
        result.heightCm == 180
        result.weightKg == new BigDecimal("75.50")
        result.shoeSizeCm == 27
    }

    def "updateProfile leaves physical stats unchanged when omitted"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder()
                .id(userId)
                .email("test@example.com")
                .heightCm(170)
                .weightKg(new BigDecimal("65.00"))
                .shoeSizeCm(25)
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
            assert savedUser.shoeSizeCm == 25
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
        thrown(BadRequestException)

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
        thrown(BadRequestException)

        where:
        weightValue << [new BigDecimal("19.99"), new BigDecimal("300.01")]
    }

    def "updateProfile throws BadRequestException when shoeSizeCm is out of bounds"() {
        given:
        def userId = UUID.randomUUID()
        def user = User.builder().id(userId).email("test@example.com").isActive(true).roles([] as Set).build()
        def request = UpdateProfileRequest.builder().shoeSizeCm(shoeSizeValue).build()

        when:
        userService.updateProfile(userId, userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.of(user)
        0 * userRepository.save(_)
        thrown(BadRequestException)

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
        thrown(ForbiddenException)
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
        thrown(BadRequestException)
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
        thrown(BadRequestException)
    }

    def "searchUsers throws BadRequestException when keyword is shorter than 2 characters"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        userService.searchUsers(callerId, "j", pageable)

        then:
        0 * userRepository.searchActiveUsers(_, _, _)
        thrown(BadRequestException)
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
}

package com.sportconnect.user.service

import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.user.api.dto.LocationRequest
import com.sportconnect.user.api.dto.UpdateProfileRequest
import com.sportconnect.user.entity.Role
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.UserRepository
import org.locationtech.jts.geom.Coordinate
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.geom.PrecisionModel
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDate

class UserServiceImplSpec extends Specification {

    UserRepository userRepository = Mock()
    GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326)

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository)

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
        1 * userRepository.findByEmail(email) >> Optional.of(user)
        result.email == email
    }

    def "getUserByEmail should throw exception when user not found"() {
        given:
        def email = "notfound@example.com"

        when:
        userService.getUserByEmail(email)

        then:
        1 * userRepository.findByEmail(email) >> Optional.empty()
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
        1 * userRepository.findByUsername(username) >> Optional.of(user)
        result.username == username
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
        def result = userService.updateProfile(userId, request)

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
        userService.updateProfile(userId, request)

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
        userService.updateProfile(userId, request)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
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
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * userRepository.save(_) >> { User savedUser ->
            assert savedUser.isActive == false
            return savedUser
        }
    }

    def "deleteUser should throw exception when user not found"() {
        given:
        def userId = UUID.randomUUID()

        when:
        userService.deleteUser(userId)

        then:
        1 * userRepository.findById(userId) >> Optional.empty()
        thrown(ResourceNotFoundException)
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
        result.roles.contains("USER")
    }
}

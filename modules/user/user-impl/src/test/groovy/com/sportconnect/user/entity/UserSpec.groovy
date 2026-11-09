package com.sportconnect.user.entity

import org.locationtech.jts.geom.Coordinate
import org.locationtech.jts.geom.GeometryFactory
import org.locationtech.jts.geom.PrecisionModel
import spock.lang.Specification

import java.time.LocalDate

class UserSpec extends Specification {

    GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326)

    def "getFullName should return first and last name when both present"() {
        given:
        def user = User.builder()
                .firstName("John")
                .lastName("Doe")
                .username("johndoe")
                .build()

        when:
        def fullName = user.getFullName()

        then:
        fullName == "John Doe"
    }

    def "getFullName should return username when first or last name missing"() {
        given:
        def user = User.builder()
                .firstName("John")
                .username("johndoe")
                .email("john@example.com")
                .build()

        when:
        def fullName = user.getFullName()

        then:
        fullName == "johndoe"
    }

    def "getFullName should return email when username and names missing"() {
        given:
        def user = User.builder()
                .email("john@example.com")
                .build()

        when:
        def fullName = user.getFullName()

        then:
        fullName == "john@example.com"
    }

    def "equals should return true for same id"() {
        given:
        def id = UUID.randomUUID()
        def user1 = User.builder().id(id).email("test1@example.com").build()
        def user2 = User.builder().id(id).email("test2@example.com").build()

        expect:
        user1.equals(user2)
    }

    def "equals should return false for different id"() {
        given:
        def user1 = User.builder().id(UUID.randomUUID()).email("test1@example.com").build()
        def user2 = User.builder().id(UUID.randomUUID()).email("test2@example.com").build()

        expect:
        !user1.equals(user2)
    }

    def "equals should return false when id is null"() {
        given:
        def user1 = User.builder().email("test1@example.com").build()
        def user2 = User.builder().email("test2@example.com").build()

        expect:
        !user1.equals(user2)
    }

    def "builder should create user with all fields"() {
        given:
        def id = UUID.randomUUID()
        def dateOfBirth = LocalDate.of(1990, 1, 1)
        def point = geometryFactory.createPoint(new Coordinate(-74.0060, 40.7128))

        when:
        def user = User.builder()
                .id(id)
                .email("test@example.com")
                .firstName("John")
                .lastName("Doe")
                .username("johndoe")
                .phoneNumber("+1234567890")
                .dateOfBirth(dateOfBirth)
                .gender("Male")
                .bio("Test bio")
                .avatarUrl("https://example.com/avatar.jpg")
                .coverUrl("https://example.com/cover.jpg")
                .location(point)
                .city("New York")
                .country("USA")
                .isEmailVerified(true)
                .isActive(true)
                .build()

        then:
        user.id == id
        user.email == "test@example.com"
        user.firstName == "John"
        user.lastName == "Doe"
        user.username == "johndoe"
        user.phoneNumber == "+1234567890"
        user.dateOfBirth == dateOfBirth
        user.gender == "Male"
        user.bio == "Test bio"
        user.avatarUrl == "https://example.com/avatar.jpg"
        user.coverUrl == "https://example.com/cover.jpg"
        user.location == point
        user.city == "New York"
        user.country == "USA"
        user.isEmailVerified == true
        user.isActive == true
    }

    def "default values should be set correctly"() {
        when:
        def user = User.builder()
                .email("test@example.com")
                .build()

        then:
        user.isEmailVerified == false
        user.isActive == true
    }
}

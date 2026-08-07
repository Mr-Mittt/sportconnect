package com.sportconnect.sport.entity

import spock.lang.Specification

class UserSportProfileSpec extends Specification {

    def "equals should return true for same id"() {
        given:
        def id = 1L
        def profile1 = UserSportProfile.builder().id(id).userId(UUID.randomUUID()).build()
        def profile2 = UserSportProfile.builder().id(id).userId(UUID.randomUUID()).build()

        expect:
        profile1.equals(profile2)
    }

    def "equals should return false for different id"() {
        given:
        def profile1 = UserSportProfile.builder().id(1L).build()
        def profile2 = UserSportProfile.builder().id(2L).build()

        expect:
        !profile1.equals(profile2)
    }

    def "equals should return false when id is null"() {
        given:
        def profile1 = UserSportProfile.builder().userId(UUID.randomUUID()).build()
        def profile2 = UserSportProfile.builder().userId(UUID.randomUUID()).build()

        expect:
        !profile1.equals(profile2)
    }

    def "builder should create profile with all fields"() {
        given:
        def id = 1L
        def userId = UUID.randomUUID()
        def sportId = 2L

        when:
        def profile = UserSportProfile.builder()
                .id(id)
                .userId(userId)
                .sportId(sportId)
                .skillLevel("Advanced")
                .yearsOfExperience(5)
                .preferredPosition("Forward")
                .bio("Passionate about the sport")
                .isActive(true)
                .build()

        then:
        profile.id == id
        profile.userId == userId
        profile.sportId == sportId
        profile.skillLevel == "Advanced"
        profile.yearsOfExperience == 5
        profile.preferredPosition == "Forward"
        profile.bio == "Passionate about the sport"
        profile.isActive == true
    }

    def "default isActive should be true"() {
        when:
        def profile = UserSportProfile.builder()
                .userId(UUID.randomUUID())
                .sportId(1L)
                .build()

        then:
        profile.isActive == true
    }
}

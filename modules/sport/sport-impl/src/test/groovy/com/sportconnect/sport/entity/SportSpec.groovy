package com.sportconnect.sport.entity

import spock.lang.Specification

class SportSpec extends Specification {

    def "equals should return true for same id"() {
        given:
        def id = 1L
        def sport1 = Sport.builder().id(id).name("Football").build()
        def sport2 = Sport.builder().id(id).name("Basketball").build()

        expect:
        sport1.equals(sport2)
    }

    def "equals should return false for different id"() {
        given:
        def sport1 = Sport.builder().id(1L).name("Football").build()
        def sport2 = Sport.builder().id(2L).name("Football").build()

        expect:
        !sport1.equals(sport2)
    }

    def "equals should return false when id is null"() {
        given:
        def sport1 = Sport.builder().name("Football").build()
        def sport2 = Sport.builder().name("Basketball").build()

        expect:
        !sport1.equals(sport2)
    }

    def "builder should create sport with all fields"() {
        given:
        def id = 1L

        when:
        def sport = Sport.builder()
                .id(id)
                .name("Basketball")
                .description("Team sport played with a ball")
                .category("Team Sports")
                .iconUrl("https://example.com/basketball.png")
                .minPlayers(5)
                .maxPlayers(10)
                .isActive(true)
                .build()

        then:
        sport.id == id
        sport.name == "Basketball"
        sport.description == "Team sport played with a ball"
        sport.category == "Team Sports"
        sport.iconUrl == "https://example.com/basketball.png"
        sport.minPlayers == 5
        sport.maxPlayers == 10
        sport.isActive == true
    }

    def "default isActive should be true"() {
        when:
        def sport = Sport.builder()
                .name("Football")
                .build()

        then:
        sport.isActive == true
    }
}

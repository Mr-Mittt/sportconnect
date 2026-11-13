package com.sportconnect.sport.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.sport.entity.Sport
import com.sportconnect.sport.repository.SportRepository
import spock.lang.Specification
import spock.lang.Subject

/** SESSION-50: the per-sport result schema read and replace paths of {@link SportServiceImpl}. */
class SportResultSchemaSpec extends Specification {

    SportRepository sportRepository = Mock()
    SportLookupCache sportLookupCache = Mock()

    @Subject
    SportServiceImpl sportService = new SportServiceImpl(sportRepository, sportLookupCache)

    def "replace stores the document untouched, evicts the cache and returns it"() {
        given:
        def sport = Sport.builder().id(1L).name("Badminton").build()
        def schema = [kind: "MATCH", maxRecords: 100, labels: [en: "Game"]]

        when:
        def result = sportService.replaceResultSchema(1L, schema)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(sport)
        1 * sportRepository.save(sport) >> sport
        1 * sportLookupCache.evictAll()
        result == schema
        sport.resultSchema == schema
    }

    def "a null schema clears the result schema (no result logging)"() {
        given:
        def sport = Sport.builder().id(1L).name("Badminton").resultSchema([kind: "MATCH"]).build()

        when:
        def result = sportService.replaceResultSchema(1L, null)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(sport)
        1 * sportRepository.save(sport) >> sport
        result == null
        sport.resultSchema == null
    }

    def "replace rejects #label with SPORT_RESULT_SCHEMA_INVALID and writes nothing"() {
        when:
        sportService.replaceResultSchema(1L, schema)

        then:
        1 * sportRepository.findById(1L) >> Optional.of(Sport.builder().id(1L).build())
        def e = thrown(BadRequestException)
        e.errorCode == "SPORT_RESULT_SCHEMA_INVALID"
        0 * sportRepository.save(_)
        0 * sportLookupCache.evictAll()

        where:
        label                       | schema
        "maxRecords 0"              | [maxRecords: 0]
        "maxRecords 501"            | [maxRecords: 501]
        "maxRecords a string"       | [maxRecords: "100"]
        "maxRecords a fraction"     | [maxRecords: 1.5d]
        "a document over 16 KB"     | [labels: ["x" * 17000]]
    }

    def "the limits at their bounds are accepted"() {
        given:
        def sport = Sport.builder().id(1L).build()
        sportRepository.findById(1L) >> Optional.of(sport)
        sportRepository.save(sport) >> sport

        expect:
        sportService.replaceResultSchema(1L, [maxRecords: 500]) == [maxRecords: 500]
        sportService.replaceResultSchema(1L, [maxRecords: 1]) == [maxRecords: 1]
    }

    def "replace of an unknown sport is a 404"() {
        when:
        sportService.replaceResultSchema(9L, [kind: "MATCH"])

        then:
        1 * sportRepository.findById(9L) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "the member read is active-only through the cache"() {
        given:
        def active = Sport.builder().id(1L).resultSchema([kind: "MATCH"]).build()
        sportLookupCache.getActiveSportsById() >> [1L: active]

        expect:
        sportService.getResultSchema(1L) == [kind: "MATCH"]

        when:
        sportService.getResultSchema(2L)

        then:
        thrown(ResourceNotFoundException)
    }

    def "a sport with no result schema reads as null"() {
        given:
        sportLookupCache.getActiveSportsById() >> [1L: Sport.builder().id(1L).build()]

        expect:
        sportService.getResultSchema(1L) == null
    }

    def "the admin read works for an inactive sport"() {
        given:
        sportRepository.findById(1L) >> Optional.of(Sport.builder().id(1L).isActive(false).resultSchema([kind: "MATCH"]).build())

        expect:
        sportService.getResultSchemaForAdmin(1L) == [kind: "MATCH"]
    }
}

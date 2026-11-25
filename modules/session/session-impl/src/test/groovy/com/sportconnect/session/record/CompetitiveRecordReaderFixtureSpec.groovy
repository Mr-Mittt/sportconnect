package com.sportconnect.session.record

import com.fasterxml.jackson.databind.ObjectMapper
import spock.lang.Specification
import spock.lang.Subject

/**
 * SESSION-53: runs every case of the shared fixture {@code record-reader/competitive-v1-cases.json} through the COMPETITIVE
 * reader. The client's Vitest runs the same file (CLIENT-SESSION-58), so the two readers cannot drift: a case added or
 * changed there is a decision for both sides.
 */
class CompetitiveRecordReaderFixtureSpec extends Specification {

    @Subject
    CompetitiveRecordReader reader = new CompetitiveRecordReader()

    static Map fixture = new ObjectMapper().readValue(
            CompetitiveRecordReaderFixtureSpec.getResource('/record-reader/competitive-v1-cases.json'), Map)

    static List cases() {
        fixture.cases as List
    }

    def "the fixture has the cases the contract needs"() {
        expect:
        cases().size() >= 23
        cases()*.id.toSet().size() == cases().size()
        fixture.schemas.keySet() == ['badminton', 'football', 'noScore', 'draws'] as Set
    }

    def "case #tc.id"() {
        given:
        Map schema = fixture.schemas[tc.schema] as Map

        when:
        def facts = reader.read(schema, tc.data as Map)

        then:
        facts.valid() == tc.expect.valid
        facts.rankable() == tc.expect.rankable
        facts.countable() == tc.expect.countable
        facts.notCountableReason() == tc.expect.notCountableReason
        (facts.participants() ? facts.participants()[0].outcome().name() : null) == tc.expect.outcomeOfFirstTeam
        facts.players()*.toString() == tc.expect.players
        if (tc.expect.valid) {
            assert facts.invalidReason() == null
            assert facts.notRankableReason() == tc.expect.notRankableReason
        } else {
            assert facts.invalidReason() == tc.expect.invalidReason
            assert facts.notRankableReason() == tc.expect.invalidReason
        }

        where:
        tc << cases()
    }
}

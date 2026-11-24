package com.sportconnect.session.record

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification
import spock.lang.Subject

/** SESSION-53: the teams and the participants (outcome and numbers) the COMPETITIVE reader adds to the facts. */
class CompetitiveRecordReaderFactsSpec extends Specification {

    @Subject
    CompetitiveRecordReader reader = new CompetitiveRecordReader()

    UUID a = UUID.randomUUID()
    UUID b = UUID.randomUUID()
    UUID c = UUID.randomUUID()
    UUID d = UUID.randomUUID()

    Map schema(List slots = [[required: true, rule: '>=0&<=30']]) {
        [maxRecords: 50, record: [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2], score: [slot: slots]]]]
    }

    Map game(List one, List two, List scoreOne, List scoreTwo) {
        [teams: [[players: one*.toString(), scores: scoreOne], [players: two*.toString(), scores: scoreTwo]]]
    }

    def "the teams come back in record order"() {
        when:
        def facts = reader.read(schema(), game([a, b], [c, d], [21], [18]))

        then:
        facts.teams() == [[a, b], [c, d]]
    }

    def "a rankable game has one participant per player: the first team wins, the second loses"() {
        when:
        def facts = reader.read(schema(), game([a, b], [c], [21], [18]))

        then:
        facts.participants()*.userId() == [a, b, c]
        facts.participants()*.team() == [0, 0, 1]
        facts.participants()*.outcome() == [Outcome.WIN, Outcome.WIN, Outcome.LOSS]
    }

    def "each player gets their team's scoreFor and the other team's as scoreAgainst"() {
        when:
        def facts = reader.read(schema(), game([a, b], [c], [21], [18]))

        then:
        facts.participants().find { it.userId() == a }.metrics() == [scoreFor: 21d, scoreAgainst: 18d]
        facts.participants().find { it.userId() == c }.metrics() == [scoreFor: 18d, scoreAgainst: 21d]
    }

    def "with several score slots the numbers are the sums over the slots both teams filled"() {
        given:
        def slots = [[required: true, rule: '>=0'], [required: false, rule: '>=0'], [required: false, rule: '>=0']]

        when:
        def facts = reader.read(schema(slots), game([a], [c], [21, 15, null], [10, 21, null]))

        then: "21 + 15 against 10 + 21; the first slot decides who wins"
        facts.rankable()
        facts.participants().find { it.userId() == a }.metrics() == [scoreFor: 36d, scoreAgainst: 31d]
        facts.participants().find { it.userId() == c }.metrics() == [scoreFor: 31d, scoreAgainst: 36d]
    }

    def "a planned game, a game the first team does not win and an invalid record have no participants"() {
        expect:
        reader.read(schema(), game([a], [c], [null], [null])).participants() == []
        reader.read(schema(), game([a], [c], [15], [21])).participants() == []
        reader.read(schema(), game([a, a], [c], [21], [18])).participants() == []
        reader.read(schema(), game([a, a], [c], [21], [18])).teams() == []
    }

    def "a game of a sport with no score slot has its teams but no participants"() {
        when:
        def facts = reader.read([record: [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2]]]],
                [teams: [[players: [a.toString()]], [players: [c.toString()]]]])

        then:
        facts.valid()
        facts.teams() == [[a], [c]]
        facts.participants() == []
    }

    def "the short constructor SESSION-72 uses leaves the teams and participants empty"() {
        when:
        def facts = new RecordFacts(true, null, true, null, [a])

        then:
        facts.players() == [a]
        facts.teams() == []
        facts.participants() == []
    }
}

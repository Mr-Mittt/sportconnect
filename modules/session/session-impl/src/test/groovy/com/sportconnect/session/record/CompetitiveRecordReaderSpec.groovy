package com.sportconnect.session.record

import spock.lang.Specification
import spock.lang.Subject

/** SESSION-72: what the COMPETITIVE reader makes of a record (valid, rankable, planned) for a badminton-like schema. */
class CompetitiveRecordReaderSpec extends Specification {

    @Subject
    CompetitiveRecordReader reader = new CompetitiveRecordReader()

    UUID a = UUID.randomUUID()
    UUID b = UUID.randomUUID()
    UUID c = UUID.randomUUID()
    UUID d = UUID.randomUUID()

    /** Badminton: 1 to 2 players a side, one required score slot of 0 to 30. */
    Map schema(Map overrides = [:]) {
        def data = [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2], score: [slot: [[required: true, rule: '>=0&<=30']]]]
        data.putAll(overrides)
        [maxRecords: 50, record: [data: data]]
    }

    Map game(List one, List two, List scoreOne = [21], List scoreTwo = [18]) {
        [teams: [[players: one*.toString(), scores: scoreOne], [players: two*.toString(), scores: scoreTwo]]]
    }

    def "a doubles game with a complete score and the first team ahead is valid and rankable, players in team order"() {
        when:
        def facts = reader.read(schema(), game([a, b], [c, d]))

        then:
        facts.valid()
        facts.rankable()
        facts.notRankableReason() == null
        facts.players() == [a, b, c, d]
    }

    def "a game with no score at all is valid but a planned game, not rankable"() {
        when:
        def facts = reader.read(schema(), game([a], [b], [null], [null]))

        then:
        facts.valid()
        !facts.rankable()
        facts.notRankableReason() == 'NO_SCORE'
        facts.isPlanned()
    }

    def "a record with no scores key at all is a planned game too"() {
        when:
        def facts = reader.read(schema(), [teams: [[players: [a.toString()]], [players: [b.toString()]]]])

        then:
        facts.valid()
        facts.isPlanned()
    }

    def "the first team must be strictly ahead: #one to #two is not rankable"() {
        when:
        def facts = reader.read(schema(), game([a], [b], [one], [two]))

        then:
        facts.valid()
        !facts.rankable()
        facts.notRankableReason() == 'FIRST_TEAM_NOT_AHEAD'
        !facts.isPlanned()

        where:
        one | two
        18  | 21
        21  | 21
    }

    def "a score only one team filled is invalid (SCORE_INCOMPLETE)"() {
        when:
        def facts = reader.read(schema(), game([a], [b], [21], [null]))

        then:
        !facts.valid()
        facts.invalidReason() == 'SCORE_INCOMPLETE'
        !facts.rankable()
    }

    def "a score outside the slot's rule is invalid (SCORE_RULE)"() {
        expect:
        reader.read(schema(), game([a], [b], [31], [10])).invalidReason() == 'SCORE_RULE'
        reader.read(schema(), game([a], [b], [-1], [10])).invalidReason() == 'SCORE_RULE'
    }

    def "an unreadable rule means any integer"() {
        expect:
        reader.read(schema(score: [slot: [[required: true, rule: 'banana']]]), game([a], [b], [500], [3])).rankable()
    }

    def "a decimal score is a bad shape"() {
        expect:
        reader.read(schema(), game([a], [b], [21.5d], [10])).invalidReason() == 'SCORE_SHAPE'
    }

    def "more scores than the sport has slots is a bad shape"() {
        expect:
        reader.read(schema(), game([a], [b], [21, 3], [10, 4])).invalidReason() == 'SCORE_SHAPE'
    }

    def "a team with a score filled must fill every required slot"() {
        given:
        def twoSlots = schema(score: [slot: [[required: true], [required: true]]])

        expect:
        reader.read(twoSlots, game([a], [b], [21, null], [10, null])).invalidReason() == 'SCORE_INCOMPLETE'
    }

    def "an optional second slot may stay empty, and the ranking slot is the first by default"() {
        given:
        def twoSlots = schema(score: [slot: [[required: true], [required: false]]])

        expect:
        reader.read(twoSlots, game([a], [b], [21, null], [10, null])).rankable()
    }

    def "record.ranking.scoreSlot picks the slot the first team must lead in"() {
        given:
        def s = schema(score: [slot: [[required: true], [required: true]]])
        s.record.ranking = [scoreSlot: 1]

        expect:
        reader.read(s, game([a], [b], [10, 21], [20, 18])).rankable()
        !reader.read(s, game([a], [b], [30, 10], [5, 18])).rankable()
    }

    def "teams must be exactly two"() {
        expect:
        reader.read(schema(), [teams: [[players: [a.toString()]]]]).invalidReason() == 'TEAMS'
        reader.read(schema(), [teams: []]).invalidReason() == 'TEAMS'
        reader.read(schema(), [other: 1]).invalidReason() == 'TEAMS'
        reader.read(schema(), null).invalidReason() == 'TEAMS'
        reader.read(schema(), [teams: [[players: [a.toString()]], 'x']]).invalidReason() == 'TEAMS'
    }

    def "a side outside playersPerSide is invalid"() {
        expect:
        reader.read(schema(), game([a, b, c], [d])).invalidReason() == 'PLAYERS_PER_SIDE'
        reader.read(schema(), game([], [d])).invalidReason() == 'PLAYERS_PER_SIDE'
    }

    def "a player id that is not a UUID is invalid"() {
        expect:
        reader.read(schema(), [teams: [[players: ['nope']], [players: [b.toString()]]]]).invalidReason() == 'PLAYER_ID'
        reader.read(schema(), [teams: [[players: [7]], [players: [b.toString()]]]]).invalidReason() == 'PLAYER_ID'
    }

    def "a player named twice, in a team or across them, is invalid"() {
        expect:
        reader.read(schema(), game([a, a], [b])).invalidReason() == 'DUPLICATE_PLAYER'
        reader.read(schema(), game([a], [a])).invalidReason() == 'DUPLICATE_PLAYER'
    }

    def "a sport with no score slot cannot be ranked: scores are not read and the record is valid"() {
        given:
        def noScore = schema(score: [slot: []])

        when:
        def facts = reader.read(noScore, game([a], [b], [null], [null]))

        then:
        facts.valid()
        !facts.rankable()
        facts.notRankableReason() == 'RANKING_NOT_AVAILABLE'
        !reader.supportsRanking(noScore)
        reader.supportsRanking(schema())
    }

    def "an invalid record names no players"() {
        expect:
        reader.read(schema(), game([a, a], [b])).players() == []
    }
}

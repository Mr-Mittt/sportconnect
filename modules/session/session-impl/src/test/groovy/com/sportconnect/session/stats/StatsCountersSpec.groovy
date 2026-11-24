package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/** SESSION-53: the running counters of one subject: outcomes, the three aggregates, and the blob round trip. */
class StatsCountersSpec extends Specification {

    def declared = [scoreFor: Aggregate.SUM, scoreAgainst: Aggregate.SUM]

    def "games, wins, losses and draws count by outcome, and a NONE outcome still counts the game"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [:], declared)
        c.add(Outcome.WIN, [:], declared)
        c.add(Outcome.LOSS, [:], declared)
        c.add(Outcome.DRAW, [:], declared)
        c.add(Outcome.NONE, [:], declared)

        then:
        c.core('games') == 5d
        c.core('wins') == 2d
        c.core('losses') == 1d
        c.core('draws') == 1d
        c.core('unknown') == null
    }

    def "SUM, MAX and MIN combine each game into the running value"() {
        given:
        def c = new StatsCounters()
        def aggregates = [total: Aggregate.SUM, best: Aggregate.MAX, fastest: Aggregate.MIN]

        when:
        c.add(Outcome.WIN, [total: 21d, best: 21d, fastest: 40d], aggregates)
        c.add(Outcome.LOSS, [total: 15d, best: 15d, fastest: 35d], aggregates)
        c.add(Outcome.WIN, [total: 30d, best: 30d, fastest: 38d], aggregates)

        then:
        c.metric('total') == 66d
        c.metric('best') == 30d
        c.metric('fastest') == 35d
    }

    def "a number the schema does not declare is not counted, and a declared one a game lacks leaves the value alone"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [scoreFor: 21d, aces: 7d], declared)      // aces is not declared; scoreAgainst is missing
        c.add(Outcome.WIN, [scoreFor: 10d, scoreAgainst: 4d], declared)

        then:
        c.metric('aces') == null
        c.metric('scoreFor') == 31d
        c.metric('scoreAgainst') == 4d
    }

    def "the blob round trip keeps every counter, and whole metrics are written as whole numbers"() {
        given:
        def c = new StatsCounters()
        c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15.5d], declared)

        when:
        def map = c.toMap()
        def back = StatsCounters.fromMap(map)

        then:
        map.games == 1L
        map.metrics.scoreFor == 21L
        map.metrics.scoreFor instanceof Long
        map.metrics.scoreAgainst == 15.5d
        back.core('wins') == 1d
        back.metric('scoreFor') == 21d
        back.metric('scoreAgainst') == 15.5d
    }

    def "a missing or malformed blob reads as no games"() {
        expect:
        StatsCounters.fromMap(null).games() == 0
        StatsCounters.fromMap('nonsense').games() == 0
        StatsCounters.fromMap([games: 'x', metrics: [a: 'y']]).metric('a') == null
    }
}

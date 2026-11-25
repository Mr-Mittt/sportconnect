package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53: the running counters of one subject: only the collected stats are kept, by outcome and by sum, and the blob
 * round trip.
 */
class StatsCountersSpec extends Specification {

    def collected(String... keys) {
        StatsCatalog.storedFor(StatsCatalog.forType('COMPETITIVE'), keys as List)
    }

    def "games, wins and losses count by outcome, and a draw or a NONE outcome still counts the game"() {
        given:
        def c = new StatsCounters()
        def stats = collected('games', 'wins', 'losses')

        when:
        c.add(Outcome.WIN, [:], stats)
        c.add(Outcome.WIN, [:], stats)
        c.add(Outcome.LOSS, [:], stats)
        c.add(Outcome.DRAW, [:], stats)
        c.add(Outcome.NONE, [:], stats)

        then:
        c.value('games') == 5d
        c.value('wins') == 2d
        c.value('losses') == 1d
        c.games() == 5
        c.value('unknown') == null
    }

    def "a stat the sport does not collect is not kept at all"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [scoreFor: 21d], collected('games', 'wins'))
        c.add(Outcome.LOSS, [scoreFor: 10d], collected('games', 'wins'))

        then:
        c.value('losses') == null
        c.value('scoreFor') == null
        c.toMap().keySet() == ['games', 'wins'] as Set
    }

    def "a collected counted stat is written as zero by a game that adds nothing to it, so 'none yet' differs from 'not collected'"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.LOSS, [:], collected('games', 'wins'))

        then:
        c.value('wins') == 0d
        c.toMap() == [games: 1, wins: 0]
    }

    def "scoreFor and scoreAgainst are sums of what each game gives; a game that lacks one leaves it alone"() {
        given:
        def c = new StatsCounters()
        def stats = collected('scoreFor', 'scoreAgainst')

        when:
        c.add(Outcome.WIN, [scoreFor: 21d, aces: 7d], stats)      // aces is no catalog stat; scoreAgainst is missing
        c.add(Outcome.WIN, [scoreFor: 10d, scoreAgainst: 4d], stats)

        then:
        c.value('aces') == null
        c.value('scoreFor') == 31d
        c.value('scoreAgainst') == 4d
    }

    def "a sum that no game has given has no value, it is not a zero"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [scoreFor: 21d], collected('scoreFor', 'scoreAgainst'))

        then:
        c.value('scoreFor') == 21d
        c.value('scoreAgainst') == null
        c.toMap() == [scoreFor: 21]
    }

    def "a formula is never stored: collecting winRate stores its operands only"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [:], collected('winRate'))

        then:
        c.toMap().keySet() == ['games', 'wins'] as Set
    }

    def "the blob round trip keeps every stored stat, and whole sums are written as whole numbers"() {
        given:
        def c = new StatsCounters()
        c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15.5d], collected('games', 'wins', 'scoreFor', 'scoreAgainst'))

        when:
        def map = c.toMap()
        def back = StatsCounters.fromMap(map)

        then:
        map.games == 1L
        map.scoreFor == 21L
        map.scoreFor instanceof Long
        map.scoreAgainst == 15.5d
        back.value('wins') == 1d
        back.value('scoreFor') == 21d
        back.value('scoreAgainst') == 15.5d
    }

    def "a missing or malformed blob reads as no games"() {
        expect:
        StatsCounters.fromMap(null).games() == 0
        StatsCounters.fromMap('nonsense').games() == 0
        StatsCounters.fromMap([games: 'x', wins: [a: 'y']]).value('games') == null
    }
}

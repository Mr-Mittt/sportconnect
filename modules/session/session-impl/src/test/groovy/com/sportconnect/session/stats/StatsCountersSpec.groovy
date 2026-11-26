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
        c.encode() == '2,1'                  // games and wins only: losses and the sums are not collected
    }

    def "a collected counted stat is written as zero by a game that adds nothing to it, so 'none yet' differs from 'not collected'"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.LOSS, [:], collected('games', 'wins'))

        then:
        c.value('wins') == 0d
        c.encode() == '1,0'
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
        c.encode() == ',,,21'               // scoreFor is id 4: the slots before it are empty, and the unset scoreAgainst after it is cut
    }

    def "a formula is never stored: collecting winRate stores its operands only"() {
        given:
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [:], collected('winRate'))

        then:
        c.encode() == '1,1'
    }

    def "the stored string has the value of the stat with id n in its n-th slot"() {
        given:
        def c = new StatsCounters()
        c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15d], collected('games', 'wins', 'losses', 'scoreFor', 'scoreAgainst'))
        c.add(Outcome.LOSS, [scoreFor: 10d, scoreAgainst: 21d], collected('games', 'wins', 'losses', 'scoreFor', 'scoreAgainst'))

        expect: "games 2, wins 1, losses 1, scoreFor 31, scoreAgainst 36"
        c.encode() == '2,1,1,31,36'
    }

    def "the round trip keeps every stored stat; whole sums have no decimal part, fractions and negatives are kept"() {
        given:
        def c = new StatsCounters()
        c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15.5d], collected('games', 'wins', 'scoreFor', 'scoreAgainst'))
        c.add(Outcome.LOSS, [scoreFor: -30d, scoreAgainst: 0d], collected('games', 'wins', 'scoreFor', 'scoreAgainst'))

        when:
        def text = c.encode()
        def back = StatsCounters.decode(text)

        then:
        text == '2,1,,-9,15.5'
        back.value('games') == 2d
        back.value('wins') == 1d
        back.value('losses') == null
        back.value('scoreFor') == -9d
        back.value('scoreAgainst') == 15.5d
    }

    def "nothing counted is an empty string, and it reads back as nothing"() {
        expect:
        new StatsCounters().encode() == ''
        StatsCounters.decode('').isEmpty()
    }

    def "a slot that is empty, not a number, has no stat id, or a trailing separator is skipped; nothing throws"() {
        expect:
        StatsCounters.decode('3,,x,7,1e1,').value('wins') == null
        StatsCounters.decode('3,,x,7,1e1,').value('games') == 3d
        StatsCounters.decode('3,,x,7,1e1,').value('scoreFor') == 7d
        StatsCounters.decode('3,,x,7,1e1,').value('scoreAgainst') == 10d
        StatsCounters.decode('1,2,3,4,5,6,7,8,9,10').value('scoreDiff') == null          // ids above the catalog's, and formulas, are never read
        StatsCounters.decode('1,NaN,Infinity').value('wins') == null
        StatsCounters.decode('1,NaN,Infinity').value('losses') == null
    }

    def "the flat map of the first builds is still read, so an older row never fails"() {
        expect:
        StatsCounters.decode([games: 3, wins: 1, scoreFor: 21.5]).value('games') == 3d
        StatsCounters.decode([games: 3, wins: 1, scoreFor: 21.5]).value('scoreFor') == 21.5d
        StatsCounters.decode([games: 'x', wins: [a: 'y']]).value('games') == null
    }

    def "a missing or malformed blob reads as no games"() {
        expect:
        StatsCounters.decode(null).games() == 0
        StatsCounters.decode(42).games() == 0
        StatsCounters.decode(['nonsense']).games() == 0
    }

    def "a session is counted once by addSession, never by a game, and only when the sport collects sessions"() {
        given:
        def withSessions = collected('games', 'sessions')
        def c = new StatsCounters()

        when:
        c.add(Outcome.WIN, [:], withSessions)
        c.add(Outcome.LOSS, [:], withSessions)
        c.addSession(withSessions)

        then: "two games and one session, the slots 3 to 8 empty"
        c.value('games') == 2d
        c.value('sessions') == 1d
        c.encode() == '2,,,,,,,,1'
        StatsCounters.decode(c.encode()).value('sessions') == 1d

        when: "a sport that does not collect it keeps nothing"
        def other = new StatsCounters()
        other.addSession(collected('games'))

        then:
        other.value('sessions') == null
        other.isEmpty()
    }
}

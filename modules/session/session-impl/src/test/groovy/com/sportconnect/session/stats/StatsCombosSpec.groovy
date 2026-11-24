package com.sportconnect.session.stats

import spock.lang.Specification

/** SESSION-53: which groups of one team's players get counters of their own (badminton: the pair). */
class StatsCombosSpec extends Specification {

    def a = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def b = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    def c = UUID.fromString('00000000-0000-0000-0000-00000000000c')

    def "the key is the same whatever order the players are listed in"() {
        expect:
        StatsCombos.key([a, b]) == StatsCombos.key([b, a])
        StatsCombos.key([a, b]) == "${a},${b}".toString()
    }

    def "a pair of two players has one combo, the same for both of them"() {
        expect:
        StatsCombos.keysFor(a, [a, b], 2) == [StatsCombos.key([a, b])]
        StatsCombos.keysFor(b, [b, a], 2) == [StatsCombos.key([a, b])]
    }

    def "in a team of three, a player is in the two pairs that include them"() {
        expect:
        StatsCombos.keysFor(a, [a, b, c], 2).toSet() == [StatsCombos.key([a, b]), StatsCombos.key([a, c])].toSet()
    }

    def "a single player has no pair, and a size below 2 means no combos"() {
        expect:
        StatsCombos.keysFor(a, [a], 2) == []
        StatsCombos.keysFor(a, [a, b], 0) == []
        StatsCombos.keysFor(a, [a, b], 1) == []
    }

    def "a player's partners are the other members of their team, sorted, and never the player"() {
        expect:
        StatsCombos.partnersOf(a, [a, b]) == [b.toString()]
        StatsCombos.partnersOf(b, [b, a]) == [a.toString()]
        StatsCombos.partnersOf(a, [c, a, b]) == [b.toString(), c.toString()]
        StatsCombos.partnersOf(a, [a]) == []
        StatsCombos.partnersOf(a, [a, b, b]) == [b.toString()]
    }

    def "a team with more other members than the cap gets no partners"() {
        given:
        def big = (1..102).collect { UUID.randomUUID() }
        def ok = (1..101).collect { UUID.randomUUID() }

        expect:
        StatsCombos.partnersOf(big[0], big) == []
        StatsCombos.partnersOf(ok[0], ok).size() == 100
    }

    def "a team with more combos than the cap gets none"() {
        given:
        def team = (1..11).collect { UUID.randomUUID() }

        expect: "C(11,2) = 55 is within the cap, C(11,5) = 462 is not"
        StatsCombos.keysFor(team[0], team, 2).size() == 10
        StatsCombos.keysFor(team[0], team, 5) == []
    }
}

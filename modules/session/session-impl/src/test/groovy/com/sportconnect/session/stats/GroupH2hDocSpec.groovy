package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53 rework, SESSION-81: the group's head-to-head document. The key rule (the smaller pair first, so a lookup never
 * tries both orders), what the wins in the value mean, draws, the cap and the blob round trip. The members are named by the
 * group's permanent member numbers (the group module owns them), so the document keeps no dictionary of its own.
 */
class GroupH2hDocSpec extends Specification {

    def row() { new GroupStats(1234L, 1L) }

    def "the matchup key is the smaller pair first, each pair its smaller member number first, whatever order it is asked in"() {
        expect:
        GroupH2hDoc.matchupKey([1, 2] as int[], [3, 4] as int[]) == '1.2-3.4'
        GroupH2hDoc.matchupKey([3, 4] as int[], [1, 2] as int[]) == '1.2-3.4'
        GroupH2hDoc.matchupKey([1, 5] as int[], [1, 2] as int[]) == '1.2-1.5'
        GroupH2hDoc.matchupKey([2, 3] as int[], [1, 9] as int[]) == '1.9-2.3'
        GroupH2hDoc.order(4, 2) == [2, 4] as int[]
        GroupH2hDoc.order(2, 4) == [2, 4] as int[]
    }

    def "the wins in a value follow the key: the first number is the wins of the first pair of the key, whichever team it was"() {
        given: "members 1 and 2 against 3 and 4, so the key is 1.2-3.4"
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)      // the first pair won, as the first team
        def afterFirst = doc.matchup([1, 2], [3, 4]).toList()
        doc.addGame([3, 4], [1, 2], Outcome.WIN, false)      // the second pair won, as the first team
        def afterSecond = doc.matchup([1, 2], [3, 4]).toList()
        doc.addGame([3, 4], [1, 2], Outcome.LOSS, false)     // the first pair won, as the second team
        def afterThird = doc.matchup([3, 4], [1, 2]).toList()
        doc.addGame([1, 2], [3, 4], Outcome.LOSS, false)     // the second pair won, as the second team
        def afterFourth = doc.matchup([1, 2], [3, 4]).toList()

        then:
        afterFirst == [1L, 0L, 1L]
        afterSecond == [1L, 1L, 2L]
        afterThird == [2L, 1L, 3L]
        afterFourth == [2L, 2L, 4L]
        doc.size() == 1
    }

    def "a pair is the same pair whichever of its two members is listed first"() {
        given:
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)
        doc.addGame([2, 1], [4, 3], Outcome.WIN, false)

        then:
        doc.size() == 1
        doc.matchup([2, 1], [4, 3]).toList() == [2L, 0L, 2L]
    }

    def "a game that is not two pairs adds nothing: a single, a trio, a team of one against two"() {
        given:
        def doc = GroupH2hDoc.read(row())

        expect:
        !doc.addGame([1], [2], Outcome.WIN, false)
        !doc.addGame([1, 2, 5], [3, 4], Outcome.WIN, false)
        !doc.addGame([1], [3, 4], Outcome.WIN, false)
        !doc.addGame([1, 2], [3], Outcome.WIN, false)
        doc.size() == 0
        doc.seq() == 0
    }

    def "a game with no result adds nothing"() {
        given:
        def doc = GroupH2hDoc.read(row())

        expect:
        !doc.addGame([1, 2], [3, 4], Outcome.NONE, false)
        doc.size() == 0
        doc.seq() == 0
    }

    def "the running game number counts only the games recorded and marks each matchup's last game"() {
        given:
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)
        doc.addGame([1], [3], Outcome.WIN, false)
        doc.addGame([1, 2], [3, 5], Outcome.WIN, false)
        doc.addGame([1, 2], [3, 4], Outcome.LOSS, false)

        then:
        doc.seq() == 3
        doc.matchup([1, 2], [3, 4])[2] == 3L
        doc.matchup([1, 2], [3, 5])[2] == 2L
    }

    def "a draw is kept only by a sport that allows them, as a third number before the game number"() {
        given:
        def withDraws = GroupH2hDoc.read(row())
        def without = GroupH2hDoc.read(row())

        when:
        def recorded = withDraws.addGame([1, 2], [3, 4], Outcome.DRAW, true)
        withDraws.addGame([1, 2], [3, 4], Outcome.WIN, true)
        def refused = without.addGame([1, 2], [3, 4], Outcome.DRAW, false)

        then:
        recorded
        withDraws.matchup([1, 2], [3, 4]).toList() == [1L, 0L, 1L, 2L]
        !refused
        without.size() == 0
        without.seq() == 0
    }

    def "an entry stored without draws gains the draws number when the sport starts allowing them"() {
        given:
        def doc = GroupH2hDoc.read(row())
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)

        when:
        doc.addGame([1, 2], [3, 4], Outcome.DRAW, true)

        then:
        doc.matchup([1, 2], [3, 4]).toList() == [1L, 0L, 1L, 2L]
    }

    def "the cap keeps the latest matchups: the least recently played one is dropped, and playing a matchup again keeps it"() {
        given:
        def doc = GroupH2hDoc.read(row())
        def games = (1..GroupH2hDoc.MAX_MATCHUPS).collect { [[2 * it, 2 * it + 1], [20000 + 2 * it, 20001 + 2 * it]] }
        games.each { doc.addGame(it[0], it[1], Outcome.WIN, false) }

        when: "the oldest matchup is played again, then a brand new one pushes the doc past the cap"
        doc.addGame(games[0][0], games[0][1], Outcome.WIN, false)
        def sizeBefore = doc.size()
        doc.addGame([90001, 90002], [90003, 90004], Outcome.WIN, false)

        then:
        sizeBefore == GroupH2hDoc.MAX_MATCHUPS
        doc.size() == GroupH2hDoc.MAX_MATCHUPS
        doc.matchup(games[0][0], games[0][1]) != null          // played again, so no longer the least recent
        doc.matchup(games[1][0], games[1][1]) == null          // the least recently played is the one dropped
        doc.matchup(games[2][0], games[2][1]) != null
    }

    def "the document round trips through the row and has only the running number and the matchups, no member dictionary"() {
        given:
        def row = row()
        def doc = GroupH2hDoc.read(row)
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)
        doc.addGame([1, 5], [3, 4], Outcome.LOSS, false)

        when:
        doc.writeTo(row)
        def again = GroupH2hDoc.read(row)

        then:
        row.h2h.keySet() == ['seq', 'h2h'] as Set
        row.h2h.seq == 2
        row.h2h.h2h == ['1.2-3.4': [1, 0, 1], '1.5-3.4': [0, 1, 2]]
        again.seq() == 2
        again.matchup([1, 5], [3, 4]).toList() == [0L, 1L, 2L]
    }

    def "a document written before the member numbers moved to the group still reads: its dictionary is ignored"() {
        given:
        def row = row()
        row.h2h = [members: ['a-uuid': 1], lastMember: 9, seq: 3, h2h: ['1.2-3.4': [2, 1, 3]]]

        when:
        def doc = GroupH2hDoc.read(row)
        doc.addGame([1, 2], [3, 4], Outcome.WIN, false)
        doc.writeTo(row)

        then:
        doc.seq() == 4
        row.h2h.keySet() == ['seq', 'h2h'] as Set
        row.h2h.h2h == ['1.2-3.4': [3, 1, 4]]
    }

    def "an empty or damaged document reads as no games"() {
        given:
        def row = row()
        row.h2h = stored

        when:
        def doc = GroupH2hDoc.read(row)

        then:
        doc.size() == 0
        doc.seq() == 0

        where:
        stored << [
                [:],
                null,
                [members: 'x', h2h: 'y', seq: 'z'],
                [h2h: ['1.2-3.4': 'nonsense', '1.2-5.6': [1, 2], '1.2-7.8': ['a', 'b', 'c']]]]
    }
}

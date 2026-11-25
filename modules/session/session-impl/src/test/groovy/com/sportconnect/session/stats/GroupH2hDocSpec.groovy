package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53 rework: the group's head-to-head document. The key rule (the smaller pair first, so a lookup never tries both
 * orders), what the wins in the value mean, the member numbers, draws, the cap, and the blob round trip.
 */
class GroupH2hDocSpec extends Specification {

    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    def xena = UUID.fromString('00000000-0000-0000-0000-0000000000c1')
    def yan = UUID.fromString('00000000-0000-0000-0000-0000000000c2')
    def zed = UUID.fromString('00000000-0000-0000-0000-0000000000c3')

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

    def "members are numbered in the order they first appear and keep their number"() {
        given:
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)
        doc.addGame([zed, alice], [xena, yan], Outcome.LOSS, false)

        then:
        doc.memberNumber(alice) == 1
        doc.memberNumber(bob) == 2
        doc.memberNumber(xena) == 3
        doc.memberNumber(yan) == 4
        doc.memberNumber(zed) == 5
        doc.memberNumber(UUID.randomUUID()) == null
    }

    def "the wins in a value follow the key: the first number is the wins of the first pair of the key, whichever team it was"() {
        given: "alice and bob are numbered 1 and 2, xena and yan 3 and 4, so the key is 1.2-3.4"
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)      // the first pair won, as the first team
        def afterFirst = doc.matchup([alice, bob], [xena, yan]).toList()
        doc.addGame([xena, yan], [alice, bob], Outcome.WIN, false)      // the second pair won, as the first team
        def afterSecond = doc.matchup([alice, bob], [xena, yan]).toList()
        doc.addGame([xena, yan], [alice, bob], Outcome.LOSS, false)     // the first pair won, as the second team
        def afterThird = doc.matchup([xena, yan], [alice, bob]).toList()
        doc.addGame([alice, bob], [xena, yan], Outcome.LOSS, false)     // the second pair won, as the second team
        def afterFourth = doc.matchup([alice, bob], [xena, yan]).toList()

        then:
        afterFirst == [1L, 0L, 1L]
        afterSecond == [1L, 1L, 2L]
        afterThird == [2L, 1L, 3L]
        afterFourth == [2L, 2L, 4L]
        doc.size() == 1
    }

    def "a pair is the same pair whichever of its two players is listed first"() {
        given:
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)
        doc.addGame([bob, alice], [yan, xena], Outcome.WIN, false)

        then:
        doc.size() == 1
        doc.matchup([bob, alice], [yan, xena]).toList() == [2L, 0L, 2L]
    }

    def "a game that is not two pairs adds nothing: a single, a trio, a team of one against two"() {
        given:
        def doc = GroupH2hDoc.read(row())

        expect:
        !doc.addGame([alice], [bob], Outcome.WIN, false)
        !doc.addGame([alice, bob, zed], [xena, yan], Outcome.WIN, false)
        !doc.addGame([alice], [xena, yan], Outcome.WIN, false)
        !doc.addGame([alice, bob], [xena], Outcome.WIN, false)
        doc.size() == 0
        doc.seq() == 0
        doc.memberNumber(alice) == null
    }

    def "a game with no result adds nothing"() {
        given:
        def doc = GroupH2hDoc.read(row())

        expect:
        !doc.addGame([alice, bob], [xena, yan], Outcome.NONE, false)
        doc.size() == 0
        doc.seq() == 0
    }

    def "the running game number counts only the games recorded and marks each matchup's last game"() {
        given:
        def doc = GroupH2hDoc.read(row())

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)
        doc.addGame([alice], [xena], Outcome.WIN, false)
        doc.addGame([alice, bob], [xena, zed], Outcome.WIN, false)
        doc.addGame([alice, bob], [xena, yan], Outcome.LOSS, false)

        then:
        doc.seq() == 3
        doc.matchup([alice, bob], [xena, yan])[2] == 3L
        doc.matchup([alice, bob], [xena, zed])[2] == 2L
    }

    def "a draw is kept only by a sport that allows them, as a third number before the game number"() {
        given:
        def withDraws = GroupH2hDoc.read(row())
        def without = GroupH2hDoc.read(row())

        when:
        def recorded = withDraws.addGame([alice, bob], [xena, yan], Outcome.DRAW, true)
        withDraws.addGame([alice, bob], [xena, yan], Outcome.WIN, true)
        def refused = without.addGame([alice, bob], [xena, yan], Outcome.DRAW, false)

        then:
        recorded
        withDraws.matchup([alice, bob], [xena, yan]).toList() == [1L, 0L, 1L, 2L]
        !refused
        without.size() == 0
        without.seq() == 0
    }

    def "an entry stored without draws gains the draws number when the sport starts allowing them"() {
        given:
        def doc = GroupH2hDoc.read(row())
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.DRAW, true)

        then:
        doc.matchup([alice, bob], [xena, yan]).toList() == [1L, 0L, 1L, 2L]
    }

    def "the cap keeps the latest matchups: the least recently played one is dropped, and playing a matchup again keeps it"() {
        given:
        def doc = GroupH2hDoc.read(row())
        def games = (1..GroupH2hDoc.MAX_MATCHUPS).collect {
            [[UUID.randomUUID(), UUID.randomUUID()], [UUID.randomUUID(), UUID.randomUUID()]]
        }
        games.each { doc.addGame(it[0], it[1], Outcome.WIN, false) }

        when: "the oldest matchup is played again, then a brand new one pushes the doc past the cap"
        doc.addGame(games[0][0], games[0][1], Outcome.WIN, false)
        def sizeBefore = doc.size()
        doc.addGame([UUID.randomUUID(), UUID.randomUUID()], [UUID.randomUUID(), UUID.randomUUID()], Outcome.WIN, false)

        then:
        sizeBefore == GroupH2hDoc.MAX_MATCHUPS
        doc.size() == GroupH2hDoc.MAX_MATCHUPS
        doc.matchup(games[0][0], games[0][1]) != null          // played again, so no longer the least recent
        doc.matchup(games[1][0], games[1][1]) == null          // the least recently played is the one dropped
        doc.matchup(games[2][0], games[2][1]) != null
    }

    def "the document round trips through the row and has the documented keys"() {
        given:
        def row = row()
        def doc = GroupH2hDoc.read(row)
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)
        doc.addGame([alice, zed], [xena, yan], Outcome.LOSS, false)

        when:
        doc.writeTo(row)
        def again = GroupH2hDoc.read(row)

        then:
        row.h2h.keySet() == ['members', 'lastMember', 'seq', 'h2h'] as Set
        row.h2h.members == [(alice.toString()): 1, (bob.toString()): 2, (xena.toString()): 3, (yan.toString()): 4, (zed.toString()): 5]
        row.h2h.lastMember == 5
        row.h2h.seq == 2
        row.h2h.h2h == ['1.2-3.4': [1, 0, 1], '1.5-3.4': [0, 1, 2]]
        again.seq() == 2
        again.memberNumber(zed) == 5
        again.matchup([alice, zed], [xena, yan]).toList() == [0L, 1L, 2L]
        again.memberNumber(UUID.randomUUID()) == null
    }

    def "a new member's number continues after the last one handed out, even for a member who left the document"() {
        given:
        def row = row()
        row.h2h = [members: [(alice.toString()): 1, (bob.toString()): 7], lastMember: 9, seq: 3, h2h: [:]]
        def doc = GroupH2hDoc.read(row)

        when:
        doc.addGame([alice, bob], [xena, yan], Outcome.WIN, false)

        then: "numbers are never reused, so the next one is 10, not 8"
        doc.memberNumber(xena) == 10
        doc.memberNumber(yan) == 11
        doc.seq() == 4
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
        doc.memberNumber(alice) == null

        where:
        stored << [
                [:],
                null,
                [members: 'x', h2h: 'y', seq: 'z'],
                [h2h: ['1.2-3.4': 'nonsense', '1.2-5.6': [1, 2], '1.2-7.8': ['a', 'b', 'c']]]]
    }
}

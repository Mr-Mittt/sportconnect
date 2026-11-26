package com.sportconnect.session.ranking

import com.sportconnect.session.record.RecordFacts.Outcome
import com.sportconnect.session.stats.StatisticsSchema
import com.sportconnect.session.stats.StatsCatalog
import com.sportconnect.session.stats.StatsCounters
import spock.lang.Specification

/**
 * SESSION-54: putting a player on a board's trees (the rule of the minimum games, a pair reached from both partners, the names
 * of a group board) and how subjects are named.
 */
class BoardSetSpec extends Specification {

    def schema = StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: [columns: ['games', 'wins']]]])
    def stats = StatsCatalog.storedFor(StatsCatalog.forType('COMPETITIVE'), ['games', 'wins'])
    def sort = SortList.fromStored([[key: 'wins', dir: 'DESC'], [key: 'games', dir: 'ASC']])
    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')

    def counters(int wins, int losses) {
        def c = new StatsCounters()
        wins.times { c.add(Outcome.WIN, [:], stats) }
        losses.times { c.add(Outcome.LOSS, [:], stats) }
        c
    }

    /** the preconditions "at least n games" (none for 0) */
    def atLeast(int games) {
        games == 0 ? RequireList.none() : RequireList.parse([[key: 'games', op: '>=', value: games]], StatsCatalog.forType('COMPETITIVE'))
    }

    def set(int minSingle, int minPair) {
        new BoardSet(schema, new BoardTree(sort), atLeast(minSingle), new BoardTree(sort), atLeast(minPair))
    }

    def "a player and a pair go on the trees with the values of their counters"() {
        given:
        def set = set(0, 0)

        when:
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(3, 1), [(bob.toString()): counters(2, 0)]))

        then:
        set.single().tupleOf(alice.toString()) == SortTuple.of([3d, 4d] as double[])
        set.pair().tupleOf("${alice},${bob}".toString()) == SortTuple.of([2d, 2d] as double[])
    }

    def "a subject below the minimum games is left off, and taken off when it falls below it"() {
        given:
        def set = set(3, 2)

        when:
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(1, 1), [(bob.toString()): counters(1, 0)]))

        then:
        set.single().size() == 0
        set.pair().size() == 0

        when: "enough games: listed"
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(2, 1), [(bob.toString()): counters(1, 1)]))

        then:
        set.single().size() == 1
        set.pair().size() == 1

        when: "the minimum is exactly the games played, still listed; a stricter set removes it"
        def stricter = new BoardSet(schema, set.single(), atLeast(4), set.pair(), atLeast(3))
        stricter.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(2, 1), [(bob.toString()): counters(1, 1)]))

        then:
        stricter.single().size() == 0
        stricter.pair().size() == 0
    }

    def "every precondition must hold, and a formula key such as the win rate works too"() {
        given:
        def catalog = StatsCatalog.forType('COMPETITIVE')
        def require = RequireList.parse([[key: 'games', op: '>=', value: 3], [key: 'wins', op: '>=', value: 2],
                                         [key: 'winRate', op: '>=', value: 0.5]], catalog)
        def set = new BoardSet(schema, new BoardTree(sort), require, null, RequireList.none())

        when: "3 games, 2 wins, rate 0.67: all three hold"
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(2, 1), [:]))

        then:
        set.single().contains(alice.toString())

        when: "3 games but 1 win: the wins condition fails, so the player is taken off"
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(1, 2), [:]))

        then:
        !set.single().contains(alice.toString())

        when: "5 games, 2 wins: games and wins hold, the win rate 0.4 does not"
        set.apply(SubjectNames.userIds(), bob, new PlayerEntries(counters(2, 3), [:]))

        then:
        !set.single().contains(bob.toString())
    }

    def "a pair reached from both partners is one subject, and applying a player twice changes nothing"() {
        given:
        def set = set(0, 0)
        def pairCounters = counters(2, 0)

        when:
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(null, [(bob.toString()): pairCounters]))
        set.apply(SubjectNames.userIds(), bob, new PlayerEntries(null, [(alice.toString()): pairCounters]))
        set.apply(SubjectNames.userIds(), bob, new PlayerEntries(null, [(alice.toString()): pairCounters]))

        then:
        set.pair().size() == 1
        set.single().size() == 0
    }

    def "a player with nothing counted there is taken off the single board"() {
        given:
        def set = set(0, 0)
        set.apply(SubjectNames.userIds(), alice, new PlayerEntries(counters(1, 0), [:]))

        when:
        set.apply(SubjectNames.userIds(), alice, PlayerEntries.NONE)

        then:
        set.single().size() == 0
    }

    def "a set without a pair tree puts only singles, and one without a single tree only pairs"() {
        given:
        def onlySingle = new BoardSet(schema, new BoardTree(sort), RequireList.none(), null, RequireList.none())
        def onlyPair = new BoardSet(schema, null, RequireList.none(), new BoardTree(sort), RequireList.none())
        def entries = new PlayerEntries(counters(1, 0), [(bob.toString()): counters(1, 0)])

        when:
        onlySingle.apply(SubjectNames.userIds(), alice, entries)
        onlyPair.apply(SubjectNames.userIds(), alice, entries)

        then:
        onlySingle.single().size() == 1
        onlySingle.pair() == null
        onlyPair.single() == null
        onlyPair.pair().size() == 1
    }

    def "region and country subjects are user ids, the pair's two ids sorted as text"() {
        expect:
        SubjectNames.userIds().single(alice) == alice.toString()
        SubjectNames.userIds().pair(alice, bob.toString()) == "${alice},${bob}".toString()
        SubjectNames.userIds().pair(bob, alice.toString()) == "${alice},${bob}".toString()
    }

    def "a group's subjects are member numbers, the pair's two numbers sorted as numbers"() {
        given:
        def names = SubjectNames.memberNumbers([(alice): 12, (bob): 3])

        expect:
        names.single(alice) == '12'
        names.pair(alice, '3') == '3,12'            // sorted as numbers, not as text ("12,3")
        names.pair(bob, '12') == '3,12'
        names.single(UUID.randomUUID()) == null
        names.pair(UUID.randomUUID(), '3') == null
        names.pair(alice, 'not a number') == null
    }
}

package com.sportconnect.session.ranking

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.session.record.RecordFacts.Outcome
import com.sportconnect.session.stats.StatisticsSchema
import com.sportconnect.session.stats.StatsCatalog
import com.sportconnect.session.stats.StatsCounters
import spock.lang.Specification

/** SESSION-54: the preconditions of a board: reading them (strictly from a person, leniently from storage) and testing counters. */
class RequireListSpec extends Specification {

    def catalog = StatsCatalog.forType('COMPETITIVE')
    def schema = StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: [columns: ['games', 'wins']]]])

    def counters(int wins, int losses) {
        def c = new StatsCounters()
        def stats = StatsCatalog.storedFor(catalog, ['games', 'wins'])
        wins.times { c.add(Outcome.WIN, [:], stats) }
        losses.times { c.add(Outcome.LOSS, [:], stats) }
        c
    }

    def "no list is no condition, and everyone who has played is listed"() {
        expect:
        RequireList.parse(null, catalog).isEmpty()
        RequireList.parse([], catalog).isEmpty()
        RequireList.none().test(counters(0, 1), schema)
    }

    def "a condition list is read and written back in the same shape"() {
        when:
        def list = RequireList.parse([[key: 'games', op: '>=', value: 5], [key: 'winRate', op: '>', value: 0.5]], catalog)

        then:
        list.conditions().size() == 2
        list.operands() as List == ['games', 'winRate']
        list.toJson() == [[key: 'games', op: '>=', value: 5L], [key: 'winRate', op: '>', value: 0.5d]]
        RequireList.fromStored(list.toJson()) == list
    }

    def "what a person sends is refused with a reason"() {
        when:
        RequireList.parse(node, catalog)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_RANKING_REQUIRE_INVALID'
        e.errorParams.reason == reason

        where:
        node                                                          | reason
        'games'                                                       | 'NOT_A_LIST'
        (1..7).collect { [key: 'games', op: '>=', value: 1] }         | 'TOO_MANY_CONDITIONS'
        [[key: 'speed', op: '>=', value: 1]]                          | 'KEY_UNKNOWN'
        [[op: '>=', value: 1]]                                        | 'KEY_UNKNOWN'
        [[key: 'games', op: '!=', value: 1]]                          | 'OP_INVALID'
        [[key: 'games', value: 1]]                                    | 'OP_INVALID'
        [[key: 'games', op: '>=', value: 'five']]                     | 'VALUE_INVALID'
        [[key: 'games', op: '>=']]                                    | 'VALUE_INVALID'
        [[key: 'games', op: '>=', value: Double.NaN]]                 | 'VALUE_INVALID'
    }

    def "a stored list that cannot be read is dropped entry by entry, never an error"() {
        expect:
        RequireList.fromStored('garbage').isEmpty()
        RequireList.fromStored([[key: 'games', op: '??', value: 1], [key: 'wins', op: '>=', value: 2]]).conditions().size() == 1
    }

    def "each operator compares the value of the stat with the number"() {
        given:
        def list = RequireList.parse([[key: 'games', op: op, value: 3]], catalog)

        expect:
        list.test(counters(games, 0), schema) == holds

        where:
        op   | games | holds
        '>=' | 3     | true
        '>=' | 2     | false
        '>'  | 3     | false
        '>'  | 4     | true
        '<=' | 3     | true
        '<=' | 4     | false
        '<'  | 3     | false
        '<'  | 2     | true
        '='  | 3     | true
        '='  | 4     | false
    }

    def "every condition must hold, and a key with no value fails its condition"() {
        given:
        def list = RequireList.parse([[key: 'games', op: '>=', value: 3], [key: 'wins', op: '>=', value: 2]], catalog)

        expect:
        list.test(counters(2, 1), schema)
        !list.test(counters(1, 2), schema)          // 3 games but 1 win
        !list.test(counters(2, 0), schema)          // 2 wins but 2 games
        !RequireList.parse([[key: 'winRate', op: '>=', value: 0]], catalog).test(new StatsCounters(), schema)   // no games: no win rate
    }
}

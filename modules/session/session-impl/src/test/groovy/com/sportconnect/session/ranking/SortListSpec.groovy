package com.sportconnect.session.ranking

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.session.record.RecordFacts.Outcome
import com.sportconnect.session.stats.StatisticsSchema
import com.sportconnect.session.stats.StatsCatalog
import com.sportconnect.session.stats.StatsCounters
import spock.lang.Specification

/** SESSION-54: reading a sort list (strictly from a person, leniently from storage) and its values for some counters. */
class SortListSpec extends Specification {

    def catalog = StatsCatalog.forType('COMPETITIVE')
    def schema = StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: [columns: ['games', 'wins', 'losses', 'winRate']]]])

    def counters(int wins, int losses) {
        def c = new StatsCounters()
        def stats = StatsCatalog.storedFor(catalog, ['games', 'wins', 'losses'])
        wins.times { c.add(Outcome.WIN, [:], stats) }
        losses.times { c.add(Outcome.LOSS, [:], stats) }
        c
    }

    def "a plain key and a weighted sum are read, each with its own direction"() {
        when:
        def list = SortList.parse([[key: 'wins', dir: 'asc'], [sum: [wins: 3, games: 1], dir: 'DESC']], catalog)

        then:
        list.size() == 2
        !list.keys()[0].descending()
        list.keys()[0].stat() == 'wins'
        list.keys()[1].isSum()
        list.keys()[1].descending()
        list.keys()[1].sum() == [wins: 3d, games: 1d]
        list.operands() as List == ['wins', 'games']
        list.toJson() == [[key: 'wins', dir: 'ASC'], [sum: [wins: 3d, games: 1d], dir: 'DESC']]
    }

    def "what a person sends is refused with a reason"() {
        when:
        SortList.parse(node, catalog)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_RANKING_SORT_INVALID'
        e.errorParams.reason == reason

        where:
        node                                                         | reason
        'wins'                                                       | 'NOT_A_LIST'
        []                                                           | 'EMPTY'
        (1..5).collect { [key: 'wins', dir: 'DESC'] }                | 'TOO_MANY_KEYS'
        [[key: 'speed', dir: 'DESC']]                                | 'KEY_UNKNOWN'
        [[dir: 'DESC']]                                              | 'KEY_UNKNOWN'
        [[key: 'wins', dir: 'DESC'], [key: 'wins', dir: 'ASC']]      | 'KEY_DUPLICATE'
        [[key: 'wins', dir: 'UP']]                                   | 'DIR_INVALID'
        [[key: 'wins']]                                              | 'DIR_INVALID'
        [[sum: [:], dir: 'DESC']]                                    | 'SUM_INVALID'
        [[sum: [wins: 0], dir: 'DESC']]                              | 'SUM_INVALID'
        [[sum: [speed: 2], dir: 'DESC']]                             | 'SUM_INVALID'
        [[sum: [wins: 'x'], dir: 'DESC']]                            | 'SUM_INVALID'
    }

    def "a stored list that cannot be read is an empty list, never an error"() {
        expect:
        SortList.fromStored('garbage').isEmpty()
        SortList.fromStored([[key: 'wins', dir: 'sideways']]).isEmpty()
        SortList.fromStored([[key: 'wins', dir: 'DESC']]).size() == 1
    }

    def "the values of a plain key, a formula key and a weighted sum"() {
        given:
        def list = SortList.parse([[key: 'wins', dir: 'DESC'], [key: 'winRate', dir: 'DESC'],
                                   [sum: [wins: 3, losses: -1], dir: 'DESC']], catalog)

        when:
        def values = list.valuesOf(counters(3, 1), schema)

        then:
        values == [3d, 0.75d, 8d] as double[]
    }

    def "a key with no value is no number, and a sum counts a missing stat as zero"() {
        given:
        def list = SortList.parse([[key: 'winRate', dir: 'DESC'], [sum: [wins: 1, scoreFor: 5], dir: 'DESC']], catalog)

        when:
        def values = list.valuesOf(new StatsCounters(), schema)

        then:
        Double.isNaN(values[0])
        values[1] == 0d
    }
}

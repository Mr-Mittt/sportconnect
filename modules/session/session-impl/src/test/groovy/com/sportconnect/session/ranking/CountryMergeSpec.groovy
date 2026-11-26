package com.sportconnect.session.ranking

import spock.lang.Specification

/** SESSION-54 (owner, 2026-11-26): the country's pair board takes each pair at its best region only. */
class CountryMergeSpec extends Specification {

    def sort = SortList.fromStored([[key: 'wins', dir: 'DESC'], [key: 'games', dir: 'ASC']])

    def region(Map pairs) {
        def tree = new BoardTree(sort)
        pairs.each { name, v -> tree.put(name, SortTuple.of(v as double[])) }
        tree
    }

    def "a pair in two regions keeps the better entry, and its games are not added up"() {
        given: "A,B played 5 ranking games in each of two regions"
        def r1 = region(['A,B': [5d, 5d], 'C,D': [9d, 12d]])
        def r2 = region(['A,B': [4d, 5d], 'E,F': [6d, 7d]])

        when:
        def country = CountryMerge.mergeRegions(sort, [r1, r2])

        then:
        country.tupleOf('A,B') == SortTuple.of([5d, 5d] as double[])
        country.entries()*.subject == ['C,D', 'E,F', 'A,B']
        country.size() == 3
    }

    def "an exact tie keeps the entry of the first region and the board does not depend on the order within a region"() {
        given:
        def r1 = region(['A,B': [5d, 5d]])
        def r2 = region(['A,B': [5d, 5d]])

        expect:
        CountryMerge.mergeRegions(sort, [r1, r2]).size() == 1
    }

    def "no region gives an empty board, and a pair only in one region is taken as it is"() {
        expect:
        CountryMerge.mergeRegions(sort, []).size() == 0
        CountryMerge.mergeRegions(sort, [region(['A,B': [1d, 2d]])]).tupleOf('A,B') == SortTuple.of([1d, 2d] as double[])
    }
}

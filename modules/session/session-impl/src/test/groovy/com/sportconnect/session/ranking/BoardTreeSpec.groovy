package com.sportconnect.session.ranking

import spock.lang.Specification

/**
 * SESSION-54: the ranked board tree. The nine-pair data set of the design discussion (2026-11-26) under both sort orders,
 * ties, an ascending key, a missing value, moving a pair, the baked previous rank, the cap and the stored form.
 */
class BoardTreeSpec extends Specification {

    static SortList sortOf(List<List> keys) {
        // each key: [name, 'DESC'|'ASC']
        SortList.fromStored(keys.collect { [key: it[0], dir: it[1]] })
    }

    /** the document as the database gives it back: written to JSON text and read again into plain maps and lists */
    static Object roundTrip(Map json) {
        def mapper = new com.fasterxml.jackson.databind.ObjectMapper()
        mapper.readValue(mapper.writeValueAsString(json), Object)
    }

    static SortTuple t(double... values) {
        SortTuple.of(values)
    }

    /** name -> [wins, games, winRate] */
    static final Map PAIRS = [
            P1: [8d, 10d, 0.8d], P2: [8d, 9d, 0.8889d], P3: [8d, 12d, 0.6667d], P4: [7d, 7d, 1.0d], P5: [20d, 40d, 0.5d],
            P6: [5d, 20d, 0.25d], P7: [5d, 6d, 0.8333d], P8: [6d, 10d, 0.6d], P9: [9d, 10d, 0.9d]]

    /** a tree over the data set with the keys read in the given order of the columns (0 wins, 1 games, 2 winRate) */
    def treeOf(SortList sort, List<Integer> columns, Map pairs = PAIRS) {
        def tree = new BoardTree(sort)
        pairs.each { name, v -> tree.put(name, t(columns.collect { v[it] } as double[])) }
        tree
    }

    def "wins, then games, then win rate (all descending): the order of the discussion"() {
        given:
        def tree = treeOf(sortOf([['wins', 'DESC'], ['games', 'DESC'], ['winRate', 'DESC']]), [0, 1, 2])

        expect:
        tree.entries()*.subject == ['P5', 'P9', 'P3', 'P1', 'P2', 'P4', 'P8', 'P6', 'P7']
        tree.entries()*.rank == (1..9)
    }

    def "games, then win rate, then wins: the second order of the discussion"() {
        given:
        def tree = treeOf(sortOf([['games', 'DESC'], ['winRate', 'DESC'], ['wins', 'DESC']]), [1, 2, 0])

        expect:
        tree.entries()*.subject == ['P5', 'P6', 'P3', 'P9', 'P1', 'P8', 'P2', 'P4', 'P7']
    }

    def "an ascending key: wins ascending, then games descending"() {
        given:
        def tree = treeOf(sortOf([['wins', 'ASC'], ['games', 'DESC']]), [0, 1],
                [A: [2d, 10d], B: [2d, 8d], C: [1d, 5d]])

        expect:
        tree.entries()*.subject == ['C', 'A', 'B']
    }

    def "subjects with the same values on every key tie and share the rank of the first place"() {
        given:
        def tree = treeOf(sortOf([['wins', 'DESC'], ['games', 'DESC'], ['winRate', 'DESC']]), [0, 1, 2],
                PAIRS + [P10: PAIRS.P1])

        when:
        def ranks = tree.ranks()

        then:
        ranks.P5 == 1
        ranks.P9 == 2
        ranks.P3 == 3
        ranks.P1 == 4
        ranks.P10 == 4
        ranks.P2 == 6
        ranks.P7 == 10
    }

    def "a value with no number ranks last, in either direction"() {
        given:
        def desc = new BoardTree(sortOf([['winRate', 'DESC']]))
        def asc = new BoardTree(sortOf([['winRate', 'ASC']]))
        [desc, asc].each { tree ->
            tree.put('has', t(0.5d))
            tree.put('none', t(Double.NaN))
            tree.put('more', t(0.9d))
        }

        expect:
        desc.entries()*.subject == ['more', 'has', 'none']
        asc.entries()*.subject == ['has', 'more', 'none']
    }

    def "moving a pair finds its old place, empties the old node and bakes the old rank, the example of the discussion"() {
        given: "wins descending, then games ascending"
        def sort = sortOf([['wins', 'DESC'], ['games', 'ASC']])
        def tree = new BoardTree(sort)
        tree.put('A,B', t(10d, 11d))
        tree.put('C,D', t(10d, 11d))
        tree.put('A,C', t(9d, 10d))
        def before = tree.ranks()

        when: "A,C won one more ranked game"
        tree.put('A,C', t(10d, 11d))
        def json = tree.toJson(before, 0)

        then:
        before == ['A,B': 1, 'C,D': 1, 'A,C': 3]
        tree.ranks() == ['A,B': 1, 'A,C': 1, 'C,D': 1]
        json.t == [['10', [['11', ['A,B~1', 'A,C~3', 'C,D~1']]]]]
        json.n == 3
    }

    def "a subject that was not on the board has no previous rank"() {
        given:
        def tree = new BoardTree(sortOf([['wins', 'DESC']]))
        tree.put('old', t(5d))
        def before = tree.ranks()
        tree.put('new', t(7d))

        when:
        def json = tree.toJson(before, 0)

        then:
        json.t == [['7', ['new']], ['5', ['old~1']]]
    }

    def "the stored form reads back to the same board, with the previous ranks"() {
        given:
        def tree = treeOf(sortOf([['wins', 'DESC'], ['games', 'DESC'], ['winRate', 'DESC']]), [0, 1, 2],
                PAIRS + [P10: PAIRS.P1])
        def json = tree.toJson(tree.ranks(), 0)

        when:
        def read = BoardTree.fromJson(json)

        then:
        read.entries()*.subject == tree.entries()*.subject
        read.ranks() == tree.ranks()
        read.tupleOf('P3') == tree.tupleOf('P3')
        read.prevRankOf('P1') == 4
        read.prevRankOf('P10') == 4
        read.sort() == tree.sort()
        read.size() == 10
    }

    def "the stored form goes through a JSON round trip unchanged, keys as text and no key reordering"() {
        given: "the tree as the database gives it back: plain lists and maps"
        def tree = treeOf(sortOf([['wins', 'DESC'], ['games', 'DESC'], ['winRate', 'DESC']]), [0, 1, 2])
        def json = tree.toJson([:], 0)

        expect: "wins 20 is before 9 and 9 before 5: numerically, which an object's key order would not give"
        json.t*.getAt(0) == ['20', '9', '8', '7', '6', '5']
        BoardTree.fromJson(roundTrip(json)).entries()*.subject == tree.entries()*.subject
    }

    def "the cap keeps the best entries and cuts the rest by subject key, with no empty node"() {
        given:
        def tree = treeOf(sortOf([['wins', 'DESC'], ['games', 'DESC'], ['winRate', 'DESC']]), [0, 1, 2])

        when:
        def json = tree.toJson([:], 3)

        then:
        json.n == 3
        json.t == [['20', [['40', [['0.5', ['P5']]]]]], ['9', [['10', [['0.9', ['P9']]]]]], ['8', [['12', [['0.6667', ['P3']]]]]]]
    }

    def "a cap that falls inside a tied leaf keeps the first subjects by key"() {
        given:
        def tree = new BoardTree(sortOf([['wins', 'DESC']]))
        ['c', 'a', 'b'].each { tree.put(it, t(5d)) }

        expect:
        tree.toJson([:], 2).t == [['5', ['a', 'b']]]
    }

    def "removing a subject empties its node and an unknown subject is no change"() {
        given:
        def tree = new BoardTree(sortOf([['wins', 'DESC']]))
        tree.put('a', t(5d))

        expect:
        tree.remove('a')
        !tree.remove('a')
        tree.size() == 0
        tree.toJson([:], 0).t == []
    }

    def "putting a subject with the values it already has changes nothing"() {
        given:
        def tree = new BoardTree(sortOf([['wins', 'DESC']]))
        tree.put('a', t(5d))

        expect:
        !tree.put('a', t(5d))
        tree.put('a', t(6d))
    }

    def "values are rounded to four decimals, so equal values are one node"() {
        given:
        def tree = new BoardTree(sortOf([['winRate', 'DESC']]))
        tree.put('a', t(2d / 3d))
        tree.put('b', t(0.66666d))

        expect:
        tree.ranks() == [a: 1, b: 1]
        tree.toJson([:], 0).t == [['0.6667', ['a', 'b']]]
    }

    def "a document that cannot be read is an empty board"() {
        expect:
        BoardTree.fromJson(null).size() == 0
        BoardTree.fromJson([v: 1, sort: [], t: []]).size() == 0
        BoardTree.fromJson([v: 1, sort: [[key: 'wins', dir: 'DESC']], t: 'nonsense']).size() == 0
    }
}

package com.sportconnect.session.stats

import spock.lang.Specification

/**
 * SESSION-53 (compact form): the history entries {@code "<0|1>-<recordId>"}: newest first, capped at 500, and the check that
 * stops a game being counted twice.
 */
class StatsHistorySpec extends Specification {

    def "an entry is the ranking mark, a dash and the record id"() {
        expect:
        StatsHistory.entry(9027L, true) == '1-9027'
        StatsHistory.entry(9031L, false) == '0-9031'
    }

    def "a new entry goes first and the others keep their order"() {
        when:
        def history = StatsHistory.prepend(['0-1'], 2L, true)

        then:
        history == ['1-2', '0-1']
    }

    def "the history is cut at #cap entries and it is the oldest that go"() {
        given:
        List<Object> history = []
        (1..600).each { history = StatsHistory.prepend(history, (long) it, false) }

        expect:
        history.size() == StatsHistory.CAP
        StatsHistory.CAP == 500
        history[0] == '0-600'
        history[499] == '0-101'
        !StatsHistory.contains(history, 100L)
        StatsHistory.contains(history, 101L)

        where:
        cap = 500
    }

    def "contains finds a record by id, whatever its ranking mark, and ignores what is not an entry"() {
        expect:
        StatsHistory.contains(['0-5'], 5L)
        StatsHistory.contains(['1-5'], 5L)
        !StatsHistory.contains(['1-5'], 6L)
        !StatsHistory.contains(['1-55'], 5L)          // the id is matched whole, not as a text suffix
        !StatsHistory.contains([], 5L)
        !StatsHistory.contains(['junk', null, 5, [recordId: 5L], '2-5', '1-', '1-x', '15'], 5L)
    }

    def "entries read back in stored order, and a value that is not an entry is skipped"() {
        expect:
        StatsHistory.read(['1-9', 'junk', '0-4', null, 7, '1-x', '0-1']) ==
                [new StatsHistory.Pointer(9L, true), new StatsHistory.Pointer(4L, false), new StatsHistory.Pointer(1L, false)]
    }
}

package com.sportconnect.session.stats

import spock.lang.Specification

/** SESSION-53: the history pointers: newest first, capped at 500, and the check that stops a game being counted twice. */
class StatsHistorySpec extends Specification {

    def "a new pointer goes first and carries the record, the session and whether it was a ranking game"() {
        when:
        def history = StatsHistory.prepend([[recordId: 1L, sessionId: 10L, ranking: false]], 2L, 11L, true)

        then:
        history.size() == 2
        history[0] == [recordId: 2L, sessionId: 11L, ranking: true]
        history[1].recordId == 1L
    }

    def "the history is cut at #cap pointers and it is the oldest that go"() {
        given:
        List<Object> history = []
        (1..600).each { history = StatsHistory.prepend(history, (long) it, 1L, false) }

        expect:
        history.size() == StatsHistory.CAP
        StatsHistory.CAP == 500
        history[0].recordId == 600L
        history[499].recordId == 101L
        !StatsHistory.contains(history, 100L)
        StatsHistory.contains(history, 101L)

        where:
        cap = 500
    }

    def "contains finds a record by id whatever the number type stored in the blob"() {
        expect:
        StatsHistory.contains([[recordId: 5, sessionId: 1]], 5L)
        StatsHistory.contains([[recordId: 5L]], 5L)
        !StatsHistory.contains([[recordId: 5L]], 6L)
        !StatsHistory.contains([], 5L)
        !StatsHistory.contains(['junk', null], 5L)
    }
}

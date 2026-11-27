package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import com.fasterxml.jackson.databind.ObjectMapper
import spock.lang.Specification

/**
 * SESSION-53 rework: the catalog of supported stats, and its contract with the client. The client's scoreboard reads
 * {@code COMPETITIVE.scoreboard.columns} of {@code record-ui-v1.json}; the server keeps its own copy of the same list, and
 * the test below fails when the two drift (owner, 2026-11-25: one shared config, so one list).
 */
class StatsCatalogSpec extends Specification {

    static final String CLIENT_CATALOG = 'client/src/features/session/recordSchema/record-ui-v1.json'

    /** The client's catalog file, found by walking up from the test's working directory to the repository root. */
    static File clientCatalog() {
        File dir = new File('').absoluteFile
        while (dir != null) {
            File candidate = new File(dir, CLIENT_CATALOG)
            if (candidate.isFile()) {
                return candidate
            }
            dir = dir.parentFile
        }
        throw new IllegalStateException("The client's catalog ${CLIENT_CATALOG} was not found above ${new File('').absolutePath}")
    }

    def competitive = StatsCatalog.forType('COMPETITIVE')

    def "the server's COMPETITIVE stats are exactly the client's scoreboard columns, in the same order"() {
        given:
        def client = new ObjectMapper().readValue(clientCatalog(), Map)

        expect:
        competitive.keySet() as List == client.COMPETITIVE.scoreboard.columns
    }

    def "the stat ids are exactly the client's COMPETITIVE.scoreboard.statIds"() {
        given:
        def client = new ObjectMapper().readValue(clientCatalog(), Map)

        expect:
        competitive.values().collectEntries { [(it.key()): it.id()] } == client.COMPETITIVE.scoreboard.statIds
    }

    def "the stat ids are the frozen, append-only contract: one per key, unique, starting at 1, stored stats first"() {
        expect: "a change here is a decision: an id is never changed or reused, a new stat takes the next number"
        StatsCatalog.ids() == [games: 1, wins: 2, losses: 3, scoreFor: 4, scoreAgainst: 5, winRate: 6, winDiff: 7, scoreDiff: 8, sessions: 9]
        StatsCatalog.ids().values().toSet().size() == StatsCatalog.ids().size()
        competitive.keySet().every { StatsCatalog.ids().containsKey(it) }
        and: "the eight first stats keep their slots, the stored ones before the formulas (SESSION-82 added the ninth, stored, after them)"
        competitive.values().findAll { it.stored() && it.key() != 'sessions' }*.id().max() < competitive.values().findAll { !it.stored() }*.id().min()
    }

    def "an id and its key convert both ways; an id no stat has, and a key no stat has, are refused or empty"() {
        expect:
        StatsCatalog.keyOfId(2) == 'wins'
        StatsCatalog.idOf('scoreAgainst') == 5
        StatsCatalog.keyOfId(99) == null
        StatsCatalog.keyOfId(0) == null

        when:
        StatsCatalog.idOf('nonsense')

        then:
        thrown(IllegalArgumentException)
    }

    def "every key the client lets a scoreboard sort by is a stat of the catalog (plus the player's name)"() {
        given:
        def client = new ObjectMapper().readValue(clientCatalog(), Map)

        expect:
        (client.COMPETITIVE.scoreboard.sortKeys as Set) - 'name' == (competitive.keySet() - 'sessions')   // sessions is a history stat: not a sort key of one session's scoreboard
        // defaultColumns goes with CLIENT-SESSION-59 (no default columns); until then it must still name catalog stats
        ((client.COMPETITIVE.scoreboard.defaultColumns ?: []) as Set).every { competitive.containsKey(it) }
    }

    def "a record type with no catalog supports nothing"() {
        expect:
        StatsCatalog.forType('RECORD').isEmpty()
        StatsCatalog.forType('nonsense').isEmpty()
        StatsCatalog.forType(null).isEmpty()
    }

    def "games, wins and losses are counted, scoreFor and scoreAgainst summed, the rest are formulas"() {
        expect:
        competitive.values().findAll { it.kind() == StatsCatalog.Kind.COUNTED }*.key() == ['games', 'wins', 'losses']
        competitive.values().findAll { it.kind() == StatsCatalog.Kind.SUMMED }*.key() == ['scoreFor', 'scoreAgainst']
        competitive.values().findAll { it.kind() == StatsCatalog.Kind.FORMULA }*.key() == ['winRate', 'winDiff', 'scoreDiff']
        competitive.values().findAll { it.stored() }*.key() == ['games', 'wins', 'losses', 'scoreFor', 'scoreAgainst', 'sessions']
    }

    def "every formula reads only stats the catalog has"() {
        expect:
        competitive.values().findAll { !it.stored() }.every { stat ->
            StatsFormulas.isValid(stat.formula()) && StatsFormulas.operands(stat.formula()).every { competitive.containsKey(it) }
        }
    }

    def "what a set of keys needs stored: the stat itself, or the operands of a formula, in catalog order, each once"() {
        expect:
        StatsCatalog.storedFor(competitive, keys)*.key() == stored

        where:
        keys                          | stored
        ['games']                     | ['games']
        ['winRate']                   | ['games', 'wins']
        ['winRate', 'games']          | ['games', 'wins']
        ['winDiff', 'scoreDiff']      | ['wins', 'losses', 'scoreFor', 'scoreAgainst']
        ['scoreAgainst', 'wins']      | ['wins', 'scoreAgainst']
        ['nope', 'name']              | []
        []                            | []
    }

    def "a game counts for games always, for wins on a win and for losses on a loss"() {
        expect:
        StatsCatalog.counts(key, outcome) == counted

        where:
        key      | outcome       | counted
        'games'  | Outcome.WIN   | true
        'games'  | Outcome.LOSS  | true
        'games'  | Outcome.DRAW  | true
        'games'  | Outcome.NONE  | true
        'wins'   | Outcome.WIN   | true
        'wins'   | Outcome.LOSS  | false
        'wins'   | Outcome.DRAW  | false
        'losses' | Outcome.LOSS  | true
        'losses' | Outcome.WIN   | false
        'losses' | Outcome.DRAW  | false
        'other'  | Outcome.WIN   | false
    }

    def "sessions is the ninth stat: stored, counted once per session, and for a single player only"() {
        expect:
        StatsCatalog.idOf('sessions') == 9
        StatsCatalog.keyOfStoredId(9) == 'sessions'
        competitive.sessions.kind() == StatsCatalog.Kind.SESSIONS
        competitive.sessions.stored()
        competitive.sessions.singleOnly()
        competitive.values().findAll { it.key() != 'sessions' }.every { !it.singleOnly() }
        !StatsCatalog.counts('sessions', com.sportconnect.session.record.RecordFacts.Outcome.WIN)
    }
}

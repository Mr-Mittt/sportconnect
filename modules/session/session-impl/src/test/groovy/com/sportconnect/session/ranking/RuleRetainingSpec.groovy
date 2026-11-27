package com.sportconnect.session.ranking

import com.sportconnect.session.record.RecordFacts.Outcome
import com.sportconnect.session.stats.StatisticsSchema
import com.sportconnect.session.stats.StatsCatalog
import com.sportconnect.session.stats.StatsCounters
import spock.lang.Specification

/**
 * SESSION-84: a rule a group board inherits (the sport's or a country's) is read through the group's list of stats: a key or a
 * condition on a stat the list cannot value is ignored, silently, and a rule with no sort key left builds no board.
 */
class RuleRetainingSpec extends Specification {

    def catalog = StatsCatalog.forType('COMPETITIVE')

    def view(List columns) {
        StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: [columns: ['games', 'wins', 'losses', 'sessions']]]])
                .forGroup([columns: columns])
    }

    def sort(List keys) {
        SortList.parse(keys, catalog)
    }

    def "a schema computes a stored stat it collects and a formula whose operands it can all give"() {
        given:
        def v = view(['winRate', 'sessions'])

        expect:
        v.computes('games')
        v.computes('wins')
        v.computes('winRate')
        v.computes('sessions')
        !v.computes('losses')
        !v.computes('winDiff')
        !v.computes('scoreFor')
        !v.computes('nope')
    }

    def "a sort list keeps the keys on stats the list can value, drops the rest, and drops the terms of a weighted sum one by one"() {
        given:
        def list = sort([[key: 'sessions', dir: 'DESC'], [key: 'wins', dir: 'DESC'],
                         [sum: [wins: 3, sessions: 1, losses: -1], dir: 'DESC']])
        def kept = list.retaining(view(['games', 'wins']).&computes)

        expect:
        kept.keys()*.stat() == ['wins', null]
        kept.keys()[1].sum() == [wins: 3d]
        list.retaining { true }.size() == 3
        list.retaining { false }.isEmpty()
        sort([[key: 'sessions', dir: 'ASC']]).retaining(view(['wins']).&computes).isEmpty()
    }

    def "a requirement keeps the conditions on stats the list can value"() {
        given:
        def require = RequireList.parse([[key: 'sessions', op: '>=', value: 1], [key: 'games', op: '>=', value: 2]], catalog)
        def kept = require.retaining(view(['games']).&computes)

        expect:
        kept.conditions()*.key() == ['games']
        require.retaining { true }.conditions().size() == 2
        require.retaining { false }.isEmpty()
    }

    def "a resolved rule is retained for a view, keeps its version, and is empty when no sort key is left"() {
        given:
        def rule = new RankingRules.Resolved(sort([[key: 'sessions', dir: 'DESC'], [key: 'wins', dir: 'DESC']]),
                RequireList.parse([[key: 'sessions', op: '>=', value: 1]], catalog), 7)

        expect:
        def kept = rule.retainedFor(view(['games', 'wins'])).get()
        kept.sort().keys()*.stat() == ['wins']
        kept.require().isEmpty()
        kept.version() == 7
        rule.retainedFor(view(['games', 'sessions'])).get().sort().keys()*.stat() == ['sessions']
        !new RankingRules.Resolved(sort([[key: 'sessions', dir: 'DESC']]), RequireList.none(), 1).retainedFor(view(['wins'])).isPresent()
    }

    def "a counters copy keeps only the stats asked for"() {
        given:
        def collected = StatsCatalog.storedFor(catalog, ['games', 'wins', 'sessions'])
        def counters = new StatsCounters()
        counters.add(Outcome.WIN, [:], collected)
        counters.addSession(collected)

        expect:
        counters.retaining(['wins', 'sessions'] as Set).value('wins') == 1d
        counters.retaining(['wins', 'sessions'] as Set).value('games') == null
        counters.retaining(['wins', 'sessions'] as Set).value('sessions') == 1d
        counters.retaining([] as Set).isEmpty()
        counters.value('games') == 1d
    }
}

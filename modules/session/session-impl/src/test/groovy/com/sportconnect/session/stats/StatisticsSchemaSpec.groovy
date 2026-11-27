package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53 rework (owner, 2026-11-25): what a sport's result schema says about its statistics. One config shared with the
 * client ({@code record.scoreboard.columns}), no defaults: no usable columns collects nothing.
 */
class StatisticsSchemaSpec extends Specification {

    /** A COMPETITIVE schema with the given scoreboard, ranking and data additions. */
    def schema(Map scoreboard = null, Map ranking = null, Map data = [:]) {
        def record = [data: [type: 'COMPETITIVE'] + data]
        if (scoreboard != null) {
            record.scoreboard = scoreboard
        }
        if (ranking != null) {
            record.ranking = ranking
        }
        [record: record]
    }

    def keys(StatisticsSchema s) {
        s.collected()*.key()
    }

    // ---- no defaults -----------------------------------------------------------------------------------------------

    def "a sport with no scoreboard columns collects nothing, whatever else it says"() {
        expect:
        !StatisticsSchema.of(input).collects()
        StatisticsSchema.of(input).columns().isEmpty()
        StatisticsSchema.of(input).collected().isEmpty()
        StatisticsSchema.of(input).groupBy().isEmpty()

        where:
        input << [
                null,
                [:],
                [record: [:]],
                schema(),
                schema([enabled: true]),
                schema([columns: []]),
                schema([columns: 'games'])]
    }

    def "the old record.statistics block is not read: a sport that only has it collects nothing"() {
        given:
        def old = [record: [data: [type: 'COMPETITIVE'], statistics: [counters: ['games', 'wins'], groupBy: [[by: 'PARTNER']]]]]

        expect:
        !StatisticsSchema.of(old).collects()
        StatisticsSchema.of(old).groupBy().isEmpty()
    }

    def "a record type with no catalog collects nothing"() {
        expect:
        !StatisticsSchema.of([record: [data: [type: 'RECORD'], scoreboard: [columns: ['games', 'wins']]]]).collects()
        !StatisticsSchema.of([record: [scoreboard: [columns: ['games']]]]).collects()
    }

    // ---- columns and what they collect -----------------------------------------------------------------------------

    def "the listed columns are collected, in the catalog's order of storage"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['wins', 'games']]))

        expect:
        s.collects()
        s.columns() == ['wins', 'games']
        keys(s) == ['games', 'wins']
    }

    def "a formula column collects its operands, which are not shown unless listed"() {
        expect:
        keys(StatisticsSchema.of(schema([columns: ['winRate']]))) == ['games', 'wins']
        StatisticsSchema.of(schema([columns: ['winRate']])).columns() == ['winRate']
        keys(StatisticsSchema.of(schema([columns: ['winDiff']]))) == ['wins', 'losses']
        keys(StatisticsSchema.of(schema([columns: ['scoreDiff']]))) == ['scoreFor', 'scoreAgainst']
    }

    def "unknown, repeated and non-catalog columns are dropped, and none left collects nothing"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games', 'aces', 'games', 7, null, 'name']])).columns() == ['games']
        !StatisticsSchema.of(schema([columns: ['aces', 'name', 'draws']])).collects()
    }

    // ---- the ranking order ------------------------------------------------------------------------------------------

    def "a sport that names no ranking order has none: there is no default sort"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games', 'wins']])).sort().isEmpty()
    }

    def "the sort keeps the catalog's keys, at most three, no repeats, with their directions"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['games', 'wins']], [sort: [
                [by: 'wins', dir: 'desc'], [by: 'wins', dir: 'ASC'], [by: 'nope', dir: 'DESC'], [by: 'games', dir: 'ASC'],
                [by: 'winRate', dir: 'DESC'], [by: 'losses', dir: 'DESC'], [by: 'scoreFor', dir: 'sideways']]]))

        expect:
        s.sort()*.by() == ['wins', 'games', 'winRate']
        s.sort()*.descending() == [true, false, true]
    }

    def "a sort key collects what it needs too, so the ranking can order by it, but only for a sport that lists columns"() {
        expect:
        keys(StatisticsSchema.of(schema([columns: ['games']], [sort: [[by: 'winDiff', dir: 'DESC']]]))) == ['games', 'wins', 'losses']
        !StatisticsSchema.of(schema(null, [sort: [[by: 'winDiff', dir: 'DESC']]])).collects()
        !StatisticsSchema.of(schema([columns: []], [sort: [[by: 'winDiff', dir: 'DESC']]])).collects()
    }

    def "minGames defaults to 0 for a single player and 5 for a combo, and is read as written"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games']])).minGamesSingle() == 0
        StatisticsSchema.of(schema([columns: ['games']])).minGamesCombo() == 5
        StatisticsSchema.of(schema([columns: ['games']], [minGames: [single: 3, combo: 8]])).minGamesSingle() == 3
        StatisticsSchema.of(schema([columns: ['games']], [minGames: [single: 3, combo: 8]])).minGamesCombo() == 8
        StatisticsSchema.of(schema([columns: ['games']], [minGames: [single: -1, combo: 'x']])).minGamesSingle() == 0
    }

    // ---- the one grouping ---------------------------------------------------------------------------------------------

    def "a sport with no groupBy has no grouping at all"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['games']]))

        expect:
        s.groupBy().isEmpty()
        !s.groupsByPartner()
        s.comboSize() == 0
    }

    def "PARTNER and TEAM with a size are the groupings, the name in any case"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'partner']]])).groupsByPartner()
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: ' Partner ']]])).groupBy() == [new StatisticsSchema.Grouping('PARTNER', 0)]
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'TEAM', size: 5]]])).comboSize() == 5
        !StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'TEAM', size: 5]]])).groupsByPartner()
    }

    def "a TEAM smaller than two, and anything else, is not a grouping"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'TEAM', size: 1]]])).groupBy().isEmpty()
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'TEAM']]])).groupBy().isEmpty()
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'CLUB']]])).groupBy().isEmpty()
        StatisticsSchema.of(schema([columns: ['games'], groupBy: 'PARTNER'])).groupBy().isEmpty()
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [7, [size: 2]]])).groupBy().isEmpty()
    }

    def "only the first usable entry is kept: a sport is grouped one way, never two"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'PARTNER'], [by: 'TEAM', size: 2]]])).groupBy() ==
                [new StatisticsSchema.Grouping('PARTNER', 0)]
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'TEAM', size: 2], [by: 'PARTNER']]])).groupBy() ==
                [new StatisticsSchema.Grouping('TEAM', 2)]
        StatisticsSchema.of(schema([columns: ['games'], groupBy: [[by: 'NOPE'], [by: 'TEAM', size: 3]]])).groupBy() ==
                [new StatisticsSchema.Grouping('TEAM', 3)]
    }

    def "groupBy is read from the scoreboard, not from the old statistics block"() {
        expect:
        StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: [columns: ['games']],
                                      statistics: [groupBy: [[by: 'PARTNER']]]]]).groupBy().isEmpty()
    }

    // ---- draws ---------------------------------------------------------------------------------------------------------

    def "a sport allows draws only when record.data.allowDraws is true"() {
        expect:
        !StatisticsSchema.of(schema([columns: ['games']])).allowDraws()
        !StatisticsSchema.of(schema([columns: ['games']], null, [allowDraws: 'yes'])).allowDraws()
        StatisticsSchema.of(schema([columns: ['games']], null, [allowDraws: true])).allowDraws()
    }

    // ---- values ----------------------------------------------------------------------------------------------------------

    def counters(StatisticsSchema s, Outcome... outcomes) {
        def c = new StatsCounters()
        outcomes.each { c.add(it, [scoreFor: 21d, scoreAgainst: 10d], s.collected()) }
        c
    }

    def "a stored stat is its counted value and a formula is computed from the stored ones"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['games', 'wins', 'winRate', 'winDiff', 'scoreDiff']]))
        def c = counters(s, Outcome.WIN, Outcome.WIN, Outcome.LOSS, Outcome.WIN)

        expect:
        s.valueOf('games', c) == 4d
        s.valueOf('wins', c) == 3d
        s.valueOf('winRate', c) == 0.75d
        s.valueOf('winDiff', c) == 2d
    }

    def "a stat the sport does not collect, or a formula over one, has no value"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['games']]))
        def c = counters(s, Outcome.WIN)

        expect:
        s.valueOf('games', c) == 1d
        s.valueOf('wins', c) == null
        s.valueOf('winRate', c) == null
        s.valueOf('scoreFor', c) == null
        s.valueOf('nope', c) == null
    }

    def "a formula that divides by zero has no value"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['winRate']]))

        expect:
        s.valueOf('winRate', new StatsCounters()) == null
    }

    def "scoreDiff is scoreFor minus scoreAgainst"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['scoreDiff']]))
        def c = counters(s, Outcome.WIN, Outcome.WIN)

        expect:
        s.valueOf('scoreDiff', c) == 22d
    }

    // ---- SESSION-82: the sessions stat, its config and the singles-only filter -------------------------------------------

    def "sessions is collected when listed, kept out of the pair and team counters, and counts joined by default"() {
        given:
        def s = StatisticsSchema.of(schema([columns: ['games', 'sessions']]))

        expect:
        s.collectsSessions()
        keys(s) as Set == ['games', 'sessions'] as Set
        s.collectedForCombos()*.key() == ['games']
        s.sessionsRule() == StatisticsSchema.SessionsRule.DEFAULT
        s.sessionsRule().counts(true, false)
        !StatisticsSchema.of(schema([columns: ['games']])).collectsSessions()
    }

    def "the sessions config: joined, atLeast1Game, or both met together (AND) or either (OR, the default)"() {
        given:
        def rule = StatisticsSchema.of(schema([columns: ['sessions'], config: [sessions: config]])).sessionsRule()

        expect:
        rule.counts(true, false) == joinedOnly
        rule.counts(true, true) == played
        !rule.counts(false, false)

        where:
        config                                                          | joinedOnly | played
        [when: ['joined']]                                            | true       | true
        [when: ['atLeast1Game']]                                      | false      | true
        [when: ['joined', 'atLeast1Game'], combine: 'AND']            | false      | true
        [when: ['joined', 'atLeast1Game'], combine: 'or']             | true       | true
        [when: ['joined', 'atLeast1Game']]                            | true       | true
    }

    def "an unusable sessions config is the default, never an error"() {
        expect:
        StatisticsSchema.of(schema([columns: ['sessions'], config: config])).sessionsRule() == StatisticsSchema.SessionsRule.DEFAULT

        where:
        config << [null, 'joined', [sessions: 'joined'], [sessions: [when: []]], [sessions: [when: ['nonsense']]], [sessions: [when: 'joined']]]
    }

    def "config.sessions.enabled false lists the column but collects nothing for it, and true or missing keeps it"() {
        expect:
        def s = StatisticsSchema.of(schema([columns: ['games', 'sessions'], config: [sessions: sessionsConfig]],
                [sort: [[by: 'sessions', dir: 'DESC']]]))
        s.collectsSessions() == on
        s.columns().contains('sessions') == on
        keys(s).contains('sessions') == on

        where:
        sessionsConfig                | on
        [enabled: false]              | false
        [enabled: false, when: ['joined']] | false
        [enabled: true]               | true
        [when: ['joined']]            | true
        [enabled: 'no']               | true
    }

    def "sessionsDisabledBySport is the sport's own enabled false, and a sport that does not list the stat has no opinion"() {
        expect:
        StatisticsSchema.of(schema([columns: ['games', 'sessions'], config: [sessions: [enabled: false]]])).sessionsDisabledBySport()
        StatisticsSchema.of(schema([columns: ['games'], config: [sessions: [enabled: false]]])).sessionsDisabledBySport()
        !StatisticsSchema.of(schema([columns: ['games', 'sessions']])).sessionsDisabledBySport()
        !StatisticsSchema.of(schema([columns: ['games']])).sessionsDisabledBySport()
        !StatisticsSchema.of(schema([columns: ['games', 'sessions'], config: [sessions: [enabled: true]]])).sessionsDisabledBySport()
        !StatisticsSchema.of(schema([columns: ['games', 'sessions'], config: [sessions: [enabled: 'no']]])).sessionsDisabledBySport()
    }
}

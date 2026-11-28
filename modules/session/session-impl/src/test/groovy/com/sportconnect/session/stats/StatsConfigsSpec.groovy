package com.sportconnect.session.stats

import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification

/**
 * SESSION-83, SESSION-84: a group's own stat list: the strict check of a settings request against the sport's current schema, the
 * rule it gives the group member row, and the effective stat list a settings answer shows.
 */
class StatsConfigsSpec extends Specification {

    /** A COMPETITIVE sport with the given default columns and per-stat config. */
    def sport(List columns = ['games', 'wins', 'sessions'], Map config = null) {
        def scoreboard = [columns: columns]
        if (config != null) {
            scoreboard.config = config
        }
        StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: scoreboard]])
    }

    def "a valid config is normalised and an empty object is valid (it clears)"() {
        expect:
        StatsConfigs.parse(input, sport()) == expected

        where:
        input                                                                              | expected
        [:]                                                                                | [:]
        [columns: ['games', 'wins']]                                                       | [columns: ['games', 'wins']]
        [columns: ['losses', 'winDiff', 'sessions']]                                       | [columns: ['losses', 'winDiff', 'sessions']]
        [config: [sessions: [:]]]                                                          | [config: [sessions: [:]]]
        [config: [sessions: [when: ['atLeast1Game', 'joined'], combine: 'and']]]          | [config: [sessions: [when: ['atLeast1Game', 'joined'], combine: 'AND']]]
        [columns: ['games'], config: [sessions: [when: ['joined']]]]                       | [columns: ['games'], config: [sessions: [when: ['joined']]]]
    }

    def "a stat the sport does not list can be named (the opt-in), one it disabled cannot, nor a formula that needs one"() {
        given:
        def withDisabled = sport(['games', 'wins', 'winRate'], [scoreFor: [enabled: false]])

        expect:
        StatsConfigs.parse([columns: ['losses', 'scoreAgainst']], withDisabled) == [columns: ['losses', 'scoreAgainst']]

        when:
        StatsConfigs.parse([columns: ['games', stat]], withDisabled)

        then:
        def e = thrown(BadRequestException)
        e.errorParams.reason == 'STAT_DISABLED_BY_SPORT'
        e.errorParams.detail == stat

        where:
        stat << ['scoreFor', 'scoreDiff']
    }

    def "a config that is not valid is refused with its reason and detail"() {
        when:
        StatsConfigs.parse(input, sport())

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_GROUP_STATS_CONFIG_INVALID'
        e.errorParams.reason == reason
        e.errorParams.detail == detail

        where:
        input                                                  | reason                  | detail
        'x'                                                    | 'NOT_AN_OBJECT'         | null
        [nope: 1]                                              | 'KEY_UNKNOWN'           | 'nope'
        [columns: []]                                          | 'COLUMNS_INVALID'       | 'columns'
        [columns: 'games']                                     | 'COLUMNS_INVALID'       | 'columns'
        [columns: ['games', 'games']]                          | 'COLUMNS_INVALID'       | 'games'
        [columns: ['games', 5]]                                | 'COLUMNS_INVALID'       | '5'
        [columns: ['speed']]                                   | 'STAT_UNKNOWN'          | 'speed'
        [config: 'x']                                          | 'NOT_AN_OBJECT'         | 'config'
        [config: [speed: [:]]]                                 | 'STAT_UNKNOWN'          | 'speed'
        [config: [games: [:]]]                                 | 'STAT_NOT_CONFIGURABLE' | 'games'
        [config: [sessions: 'x']]                              | 'NOT_AN_OBJECT'         | 'config.sessions'
        [config: [sessions: [enabled: false]]]                 | 'KEY_UNKNOWN'           | 'config.sessions.enabled'
        [config: [sessions: [when: []]]]                       | 'WHEN_INVALID'          | 'config.sessions.when'
        [config: [sessions: [when: ['joined', 'joined']]]]     | 'WHEN_INVALID'          | 'joined'
        [config: [sessions: [when: ['played']]]]               | 'WHEN_INVALID'          | 'played'
        [config: [sessions: [combine: 'XOR']]]                 | 'COMBINE_INVALID'       | 'config.sessions.combine'
        [config: [sessions: [color: 1]]]                       | 'KEY_UNKNOWN'           | 'config.sessions.color'
    }

    def "the group's own when replaces the sport's rule, a group that does not name one keeps the sport's"() {
        given:
        def sportRule = new StatisticsSchema.SessionsRule(false, true, false)       // atLeast1Game

        expect:
        StatsConfigs.sessionsRule(null, sportRule) == sportRule
        StatsConfigs.sessionsRule([:], sportRule) == sportRule
        StatsConfigs.sessionsRule([sessions: [:]], sportRule) == sportRule
        StatsConfigs.sessionsRule([sessions: [when: ['joined']]], sportRule) == new StatisticsSchema.SessionsRule(true, false, false)
        StatsConfigs.sessionsRule([sessions: [when: ['joined', 'atLeast1Game'], combine: 'AND']], sportRule) ==
                new StatisticsSchema.SessionsRule(true, true, true)
    }

    def "the effective list is the group's list over the sport's, with every other catalog stat in off and why"() {
        expect:
        StatsConfigs.effective(sport(['games', 'wins', 'sessions']), null) == [
                columns: ['games', 'wins', 'sessions'],
                config : [sessions: [when: ['joined'], combine: 'OR']],
                off    : [losses: 'NOT_IN_LIST', scoreFor: 'NOT_IN_LIST', scoreAgainst: 'NOT_IN_LIST', winRate: 'NOT_IN_LIST',
                          winDiff: 'NOT_IN_LIST', scoreDiff: 'NOT_IN_LIST']]
        StatsConfigs.effective(sport(['games', 'wins', 'sessions']),
                [columns: ['wins', 'losses', 'winDiff'], config: [sessions: [when: ['atLeast1Game']]]]) == [
                columns: ['wins', 'losses', 'winDiff'],
                config : [:],
                off    : [games: 'NOT_IN_LIST', scoreFor: 'NOT_IN_LIST', scoreAgainst: 'NOT_IN_LIST', winRate: 'NOT_IN_LIST',
                          scoreDiff: 'NOT_IN_LIST', sessions: 'NOT_IN_LIST']]
    }

    def "the effective off reasons: the sport's disable, a formula that lost an operand, the sport's own default"() {
        given:
        def disabled = sport(['games', 'wins', 'winRate', 'scoreFor', 'scoreDiff'], [scoreFor: [enabled: false]])
        def effective = StatsConfigs.effective(disabled, null)

        expect:
        effective.columns == ['games', 'wins', 'winRate']
        effective.off.scoreFor == 'SPORT_DISABLED'
        effective.off.scoreDiff == 'OPERAND_DISABLED'
        effective.off.scoreAgainst == 'NOT_IN_LIST'
        effective.config == [:]

        and: "a group that lists the stat the sport did not list opts in, and its rule for sessions is shown with it"
        StatsConfigs.effective(sport(['games']), [columns: ['games', 'sessions'], config: [sessions: [when: ['atLeast1Game'], combine: 'and']]]).config ==
                [sessions: [when: ['atLeast1Game'], combine: 'AND']]
    }
}

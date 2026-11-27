package com.sportconnect.session.stats

import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification

/**
 * SESSION-83: a group's own stats config: the strict check of a settings request, what it switches off, which rule it gives the
 * group member row, and the effective config a settings answer shows.
 */
class StatsConfigsSpec extends Specification {

    def sport(Map sessionsConfig = null, List columns = ['games', 'wins', 'sessions']) {
        def scoreboard = [columns: columns]
        if (sessionsConfig != null) {
            scoreboard.config = [sessions: sessionsConfig]
        }
        StatisticsSchema.of([record: [data: [type: 'COMPETITIVE'], scoreboard: scoreboard]])
    }

    def "a valid config is normalised and an empty object is valid (it clears)"() {
        expect:
        StatsConfigs.parse(input) == expected

        where:
        input                                                                  | expected
        [:]                                                                    | [:]
        [sessions: [:]]                                                        | [sessions: [:]]
        [sessions: [enabled: false]]                                           | [sessions: [enabled: false]]
        [sessions: [when: ['atLeast1Game', 'joined'], combine: 'and']]         | [sessions: [when: ['atLeast1Game', 'joined'], combine: 'AND']]
        [sessions: [enabled: true, when: ['joined'], combine: 'OR']]           | [sessions: [enabled: true, when: ['joined'], combine: 'OR']]
    }

    def "a config that is not valid is refused with its reason and detail"() {
        when:
        StatsConfigs.parse(input)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_GROUP_STATS_CONFIG_INVALID'
        e.errorParams.reason == reason
        e.errorParams.detail == detail

        where:
        input                                                  | reason                  | detail
        'x'                                                    | 'NOT_AN_OBJECT'         | null
        [nope: [:]]                                            | 'KEY_UNKNOWN'           | 'nope'
        [games: [enabled: false]]                              | 'STAT_NOT_CONFIGURABLE' | 'games'
        [sessions: 'x']                                        | 'NOT_AN_OBJECT'         | 'sessions'
        [sessions: [enabled: 'no']]                            | 'ENABLED_INVALID'       | 'sessions.enabled'
        [sessions: [when: []]]                                 | 'WHEN_INVALID'          | 'sessions.when'
        [sessions: [when: 'joined']]                           | 'WHEN_INVALID'          | 'sessions.when'
        [sessions: [when: ['joined', 'joined']]]               | 'WHEN_INVALID'          | 'joined'
        [sessions: [when: ['played']]]                         | 'WHEN_INVALID'          | 'played'
        [sessions: [combine: 'XOR']]                           | 'COMBINE_INVALID'       | 'sessions.combine'
        [sessions: [color: 1]]                                 | 'KEY_UNKNOWN'           | 'sessions.color'
    }

    def "only an explicit enabled false switches the stat off"() {
        expect:
        StatsConfigs.disables(config, 'sessions') == off
        StatsConfigs.disabledStats(config) == (off ? ['sessions'] as Set : [] as Set)

        where:
        config                                  | off
        null                                    | false
        [:]                                     | false
        [sessions: [:]]                         | false
        [sessions: [enabled: true]]             | false
        [sessions: [when: ['joined']]]          | false
        [sessions: [enabled: false]]            | true
        [sessions: [enabled: false, when: ['joined']]] | true
    }

    def "the group's own when replaces the sport's rule, a group that does not name one keeps the sport's"() {
        given:
        def sportRule = new StatisticsSchema.SessionsRule(false, true, false)       // atLeast1Game

        expect:
        StatsConfigs.sessionsRule(null, sportRule) == sportRule
        StatsConfigs.sessionsRule([sessions: [enabled: true]], sportRule) == sportRule
        StatsConfigs.sessionsRule([sessions: [when: ['joined']]], sportRule) == new StatisticsSchema.SessionsRule(true, false, false)
        StatsConfigs.sessionsRule([sessions: [when: ['joined', 'atLeast1Game'], combine: 'AND']], sportRule) ==
                new StatisticsSchema.SessionsRule(true, true, true)
    }

    def "the effective config is the group's rule over the sport's, off when the sport does not collect it or the group switched it off"() {
        expect:
        StatsConfigs.effective(sport([when: ['atLeast1Game']]), null).sessions == [enabled: true, when: ['atLeast1Game'], combine: 'OR']
        StatsConfigs.effective(sport(), null).sessions == [enabled: true, when: ['joined'], combine: 'OR']
        StatsConfigs.effective(sport([when: ['atLeast1Game']]), [sessions: [when: ['joined']]]).sessions == [enabled: true, when: ['joined'], combine: 'OR']
        StatsConfigs.effective(sport(), [sessions: [enabled: false]]).sessions == [enabled: false, reason: 'GROUP_DISABLED']
        StatsConfigs.effective(sport(null, ['games']), null).sessions == [enabled: false, reason: 'NOT_LISTED_BY_SPORT']
        StatsConfigs.effective(sport([enabled: false]), null).sessions == [enabled: false, reason: 'SPORT_DISABLED']
        StatsConfigs.effective(sport([enabled: false]), [sessions: [enabled: true, when: ['joined']]]).sessions == [enabled: false, reason: 'SPORT_DISABLED']
        StatsConfigs.effective(sport([enabled: false]), [sessions: [enabled: false]]).sessions == [enabled: false, reason: 'SPORT_DISABLED']
    }

    def "a counters copy without a stat reads it as no value and keeps the others"() {
        given:
        def collected = StatsCatalog.storedFor(StatsCatalog.forType('COMPETITIVE'), ['games', 'sessions'])
        def counters = new StatsCounters()
        counters.add(com.sportconnect.session.record.RecordFacts.Outcome.WIN, [:], collected)
        counters.addSession(collected)

        when:
        def without = counters.without(['sessions'] as Set)

        then:
        without.value('games') == 1d
        without.value('sessions') == null
        counters.value('sessions') == 1d
    }
}

package com.sportconnect.session.stats

import spock.lang.Specification

/** SESSION-53: what a sport's schema says about its statistics and ranking, read leniently with the badminton defaults. */
class StatisticsSchemaSpec extends Specification {

    Map badminton(Map extra = [:]) {
        def record = [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2], score: [slot: [[required: true]]]]]
        record.putAll(extra)
        [record: record]
    }

    def "a competitive schema with no statistics block gets the default metrics and derived columns, and no groupings"() {
        when:
        def s = StatisticsSchema.of(badminton())

        then:
        s.metrics() == [scoreFor: Aggregate.SUM, scoreAgainst: Aggregate.SUM]
        s.derived()*.key() == ['winRate', 'winDiff', 'scoreDiff']
        s.comboSize() == 0
        s.counters() == ['games', 'wins']
        s.groupBy() == []
        !s.groupsByPartner()
        s.sort()*.by() == ['winDiff', 'winRate', 'games']
        s.sort().every { it.descending() }
        s.minGamesSingle() == 0
        s.minGamesCombo() == 5
    }

    def "the default groups by nothing, whatever the side size: a sport asks for partners or teams with groupBy"() {
        expect:
        StatisticsSchema.of([record: [data: [playersPerSide: [min: 1, max: 11]]]]).groupBy() == []
        StatisticsSchema.of([record: [data: [playersPerSide: [min: 1, max: 2]]]]).groupBy() == []
        StatisticsSchema.of([record: [data: [playersPerSide: [min: 1, max: 2]]]]).comboSize() == 0
        !StatisticsSchema.of([record: [data: [playersPerSide: [min: 1, max: 2]]]]).groupsByPartner()
        StatisticsSchema.of([:]).groupBy() == []
        StatisticsSchema.of([:]).counters() == ['games', 'wins']
    }

    def "a present statistics block is taken as written, a missing part being empty"() {
        when:
        def s = StatisticsSchema.of(badminton(statistics: [
                metrics: [[key: 'scoreFor', aggregate: 'max'], [key: 'scoreAgainst', aggregate: 'MIN']],
                derived: [[key: 'goalDiff', formula: 'scoreFor-scoreAgainst']]]))

        then:
        s.metrics() == [scoreFor: Aggregate.MAX, scoreAgainst: Aggregate.MIN]
        s.derived()*.key() == ['goalDiff']
        s.comboSize() == 0          // no groupBy: none, whatever playersPerSide says
        s.groupBy() == []
        s.counters() == ['games', 'wins']
    }

    def "groupBy TEAM takes effect from size 2 up and an unusable size drops the entry"() {
        expect:
        StatisticsSchema.of(badminton(statistics: [groupBy: [[by: 'TEAM', size: 3]]])).comboSize() == 3
        StatisticsSchema.of(badminton(statistics: [groupBy: [[by: 'TEAM', size: 1]]])).groupBy() == []
        StatisticsSchema.of(badminton(statistics: [groupBy: [[by: 'TEAM', size: 'two']]])).groupBy() == []
        StatisticsSchema.of(badminton(statistics: [groupBy: [[by: 'TEAM']]])).groupBy() == []
    }

    def "groupBy PARTNER stands alone, a name is read in any case, and unknown or repeated dimensions are dropped"() {
        when:
        def s = StatisticsSchema.of(badminton(statistics: [groupBy: [
                [by: 'partner'], [by: 'OPPONENT'], [by: 'PARTNER'], [by: 'Team', size: 2], [by: 'TEAM', size: 3], 'PARTNER', [size: 2]]]))

        then:
        s.groupBy() == [new StatisticsSchema.Grouping('PARTNER', 0), new StatisticsSchema.Grouping('TEAM', 2)]
        s.groupsByPartner()
        s.comboSize() == 2
    }

    def "a schema that groups by partner only has no team boards"() {
        when:
        def s = StatisticsSchema.of(badminton(statistics: [groupBy: [[by: 'PARTNER']]]))

        then:
        s.groupsByPartner()
        s.comboSize() == 0
    }

    def "counters lists the core counters to show: missing means games and wins, a list is taken as written"() {
        expect:
        StatisticsSchema.of(badminton(statistics: [metrics: []])).counters() == ['games', 'wins']
        StatisticsSchema.of(badminton(statistics: [counters: ['wins', 'games', 'losses']])).counters() == ['wins', 'games', 'losses']
        StatisticsSchema.of(badminton(statistics: [counters: ['wins', 'aces', 'wins', 7]])).counters() == ['wins']
        StatisticsSchema.of(badminton(statistics: [counters: []])).counters() == []
        StatisticsSchema.of(badminton(statistics: [counters: 'games'])).counters() == ['games', 'wins']
    }

    def "an entry the server cannot use is dropped, never an error"() {
        when:
        def s = StatisticsSchema.of(badminton(statistics: [
                metrics: [[key: 'aces', aggregate: 'AVERAGE'], [key: 'wins', aggregate: 'SUM'], [key: '', aggregate: 'SUM'],
                          [key: 'points', aggregate: 'SUM']],
                derived: [[key: 'bad', formula: 'wins/(games)'], [key: 'winRate', formula: 'wins/games'], [key: 'games', formula: 'wins+1']]]))

        then: "an unknown aggregate, a core counter or a blank key cannot be a metric; a bad formula or a core name is no column"
        s.metrics() == [points: Aggregate.SUM]
        s.derived()*.key() == ['winRate']
    }

    def "the sort keeps at most three keys, in order, and drops unknown keys, directions and repeats"() {
        when:
        def s = StatisticsSchema.of(badminton(ranking: [sort: [
                [by: 'wins', dir: 'DESC'], [by: 'nonsense', dir: 'DESC'], [by: 'winRate', dir: 'sideways'],
                [by: 'wins', dir: 'ASC'], [by: 'losses', dir: 'asc'], [by: 'games', dir: 'DESC'], [by: 'winDiff', dir: 'DESC']]]))

        then:
        s.sort()*.by() == ['wins', 'losses', 'games']
        s.sort()*.descending() == [true, false, true]
    }

    def "minGames comes from the ranking block"() {
        when:
        def s = StatisticsSchema.of(badminton(ranking: [minGames: [single: 3, combo: 10]]))

        then:
        s.minGamesSingle() == 3
        s.minGamesCombo() == 10
    }

    def "valueOf reads a core counter, a metric and a derived column, and gives no value for a division by zero"() {
        given:
        def s = StatisticsSchema.of(badminton())
        def c = new StatsCounters()
        c.add(com.sportconnect.session.record.RecordFacts.Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15d], s.metrics())
        c.add(com.sportconnect.session.record.RecordFacts.Outcome.LOSS, [scoreFor: 10d, scoreAgainst: 21d], s.metrics())
        c.add(com.sportconnect.session.record.RecordFacts.Outcome.WIN, [scoreFor: 21d, scoreAgainst: 19d], s.metrics())

        expect:
        s.valueOf('games', c) == 3d
        s.valueOf('scoreFor', c) == 52d
        s.valueOf('winRate', c) == 2d / 3d
        s.valueOf('winDiff', c) == 1d
        s.valueOf('scoreDiff', c) == 52d - 55d
        s.valueOf('nonsense', c) == null
        s.valueOf('winRate', new StatsCounters()) == null      // 0 / 0
    }

    def "a derived column may be built on another derived column, to a small depth"() {
        given:
        def s = StatisticsSchema.of(badminton(statistics: [
                metrics: [[key: 'points', aggregate: 'SUM']],
                derived: [[key: 'perGame', formula: 'points/games'], [key: 'doubled', formula: 'perGame*2']]]))
        def c = new StatsCounters()
        c.add(com.sportconnect.session.record.RecordFacts.Outcome.WIN, [points: 30d], s.metrics())
        c.add(com.sportconnect.session.record.RecordFacts.Outcome.WIN, [points: 10d], s.metrics())

        expect:
        s.valueOf('perGame', c) == 20d
        s.valueOf('doubled', c) == 40d
    }
}

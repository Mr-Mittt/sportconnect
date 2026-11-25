package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-73: what the read side adds to the engine's classes: "normal = all - ranked", the values of a sport's columns, and
 * read-only views of the blobs.
 */
class StatsReadHelpersSpec extends Specification {

    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')

    def sport(List columns = ['games', 'wins', 'scoreFor', 'scoreAgainst', 'winRate', 'winDiff', 'scoreDiff']) {
        StatisticsSchema.of([record: [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2]],
                                      scoreboard: [columns: columns]]])
    }

    def collected() {
        sport().collected()
    }

    // ---- StatsCounters.minus -------------------------------------------------------------------------------------

    def "normal is all minus ranked for the counted stats and the sums"() {
        given:
        def all = new StatsCounters()
        3.times { all.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 10d], collected()) }
        all.add(Outcome.LOSS, [scoreFor: 5d, scoreAgainst: 21d], collected())
        def ranked = new StatsCounters()
        ranked.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 10d], collected())
        ranked.add(Outcome.LOSS, [scoreFor: 5d, scoreAgainst: 21d], collected())

        when:
        def normal = all.minus(ranked)

        then:
        normal.value('games') == 2d
        normal.value('wins') == 2d
        normal.value('losses') == 0d
        normal.value('scoreFor') == 42d
        normal.value('scoreAgainst') == 20d
    }

    def "a stat the ranked games never gave leaves the full value, a stat only ranked holds is ignored, nothing goes below zero"() {
        given:
        def all = new StatsCounters()
        all.add(Outcome.WIN, [scoreFor: 7d], collected())
        def none = new StatsCounters()
        def tooMany = new StatsCounters()
        2.times { tooMany.add(Outcome.WIN, [scoreFor: 9d], collected()) }
        def onlyRanked = new StatsCounters()
        onlyRanked.add(Outcome.WIN, [:], sport(['games']).collected())

        expect:
        all.minus(none).value('scoreFor') == 7d
        all.minus(tooMany).value('games') == 0d
        all.minus(tooMany).value('scoreFor') == 0d
        new StatsCounters().minus(onlyRanked).toMap() == [:]
    }

    def "minus does not change either operand"() {
        given:
        def all = new StatsCounters()
        all.add(Outcome.WIN, [scoreFor: 7d], collected())
        def ranked = new StatsCounters()
        ranked.add(Outcome.WIN, [scoreFor: 3d], collected())

        when:
        all.minus(ranked)

        then:
        all.value('games') == 1d
        all.value('scoreFor') == 7d
        ranked.value('scoreFor') == 3d
    }

    // ---- StatisticsSchema.valuesOf -------------------------------------------------------------------------------

    def "values are one number per listed column, in the column order, null where there is no value yet"() {
        given:
        def s = sport()
        def c = new StatsCounters()

        expect:
        s.valuesOf(c).keySet() as List == s.columns()
        s.valuesOf(c).values().every { it == null }

        when:
        c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15d], s.collected())

        then:
        s.valuesOf(c).games == 1d
        s.valuesOf(c).wins == 1d
        s.valuesOf(c).winRate == 1d
        s.valuesOf(c).scoreDiff == 6d
        s.valuesOf(c).winDiff == 1d
    }

    def "a sport with no columns has no values at all"() {
        expect:
        sport([]).valuesOf(new StatsCounters()) == [:]
        sport([]).columns() == []
    }

    // ---- the read-only views of the blobs --------------------------------------------------------------------------

    def "the history pointers read back newest first, and an entry that is not a pointer is skipped"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.history = [[recordId: 9, sessionId: 3, ranking: true], 'junk', [recordId: 'x', sessionId: 3],
                       [recordId: 4L, sessionId: 2L, ranking: false], [recordId: 1, sessionId: 1]]

        when:
        def pointers = PlayerStatsDoc.read(row).pointers()

        then:
        pointers*.recordId() == [9L, 4L, 1L]
        pointers*.sessionId() == [3L, 2L, 1L]
        pointers*.ranking() == [true, false, false]
    }

    def "the groupings view lists what is stored and reading it creates nothing"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.group('PARTNER', bob.toString()).all().add(Outcome.WIN, [:], collected())

        when:
        def view = doc.groupings()

        then:
        view.keySet() == ['PARTNER'] as Set
        view.PARTNER[bob.toString()].all().games() == 1L
        doc.groupings().containsKey('TEAM') == false

        when: "the view cannot be used to change the blob"
        view.put('TEAM', [:])

        then:
        thrown(UnsupportedOperationException)
    }

    def "the scope entries tell their place and the group member's groupings are readable"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.scope('REGION', 7L, 70L).counters().add(Outcome.WIN, [:], collected())
        doc.scope('COUNTRY', 7L, null).counters().add(Outcome.WIN, [:], collected())
        def groupRow = new GroupMemberStats(5L, alice, 1L)
        def groupDoc = GroupStatsDoc.read(groupRow)
        groupDoc.group('TEAM', "${alice},${bob}".toString()).add(Outcome.WIN, [:], collected())

        expect:
        doc.scopes()*.scope() == ['REGION', 'COUNTRY']
        doc.scopes()*.countryId() == [7L, 7L]
        doc.scopes()*.regionId() == [70L, null]
        groupDoc.groupings().TEAM["${alice},${bob}".toString()].games() == 1L
    }
}

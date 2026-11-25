package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53 / SESSION-81: the jsonb shape of the statistics blobs, the one place it is written and read
 * (documentation/md/STATISTICS_JSONB_REFERENCE.md). The counters hold only the stats the sport collects (here games, wins and
 * scoreFor) and are one string each, the value of the stat with id n in the n-th slot (games 1, wins 2, scoreFor 4), so
 * {@code "2,1,,31"} is 2 games, 1 win, no losses slot and 31 scoreFor. A partner or team entry is {@code "<all>/<ranked>"}.
 */
class StatsDocsSpec extends Specification {

    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    def carol = UUID.fromString('00000000-0000-0000-0000-00000000000c')
    def stats = StatsCatalog.storedFor(StatsCatalog.forType('COMPETITIVE'), ['games', 'wins', 'scoreFor'])

    def "a new player row reads as no games and writes the documented keys"() {
        given:
        def row = new UserSportStats(alice, 1L)

        when:
        def doc = PlayerStatsDoc.read(row)
        doc.writeTo(row)

        then:
        row.personal.keySet() == ['all'] as Set          // no ranked node while nothing was counted into it
        row.personal.all == ''
        row.groupings == [:]
        row.scopes == []
        row.history == []
    }

    def "personal counters hold only the collected stats, as one string each, for all games and for the ranking games among them"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.personal().all().add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 5d], stats)
        doc.personal().all().add(Outcome.LOSS, [scoreFor: 10d], stats)
        doc.personal().ranked().add(Outcome.WIN, [scoreFor: 21d], stats)

        when:
        doc.writeTo(row)

        then:
        row.personal.all == '2,1,,31'                 // 2 games, 1 win, (losses: not collected), 31 scoreFor
        row.personal.ranked == '1,1,,21'
        PlayerStatsDoc.read(row).personal().all().value('scoreFor') == 31d
    }

    def "a partner nothing was counted as ranking with has no ranked part, and one that has keeps it"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.group('PARTNER', bob.toString()).all().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('PARTNER', carol.toString()).all().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('PARTNER', carol.toString()).ranked().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.personal().all().add(Outcome.WIN, [scoreFor: 21d], stats)

        when:
        doc.writeTo(row)
        def again = PlayerStatsDoc.read(row)

        then:
        row.groupings.PARTNER[bob.toString()] == '1,1,,21'
        row.groupings.PARTNER[carol.toString()] == '1,1,,21/1,1,,21'
        !row.personal.containsKey('ranked')
        again.group('PARTNER', bob.toString()).ranked().value('games') == null          // a missing part reads as empty
        again.group('PARTNER', bob.toString()).ranked().isEmpty()
        again.personal().ranked().isEmpty()
        again.group('PARTNER', carol.toString()).ranked().value('wins') == 1d
    }

    def "a player's groupings are by dimension then key, each one string with all and ranked, and read back unchanged"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.group('PARTNER', bob.toString()).all().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('PARTNER', bob.toString()).all().add(Outcome.LOSS, [scoreFor: 10d], stats)
        doc.group('PARTNER', bob.toString()).ranked().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('TEAM', "${alice},${bob}".toString()).all().add(Outcome.WIN, [scoreFor: 21d], stats)

        when:
        doc.writeTo(row)
        def again = PlayerStatsDoc.read(row)

        then:
        row.groupings.keySet() == ['PARTNER', 'TEAM'] as Set
        row.groupings.PARTNER[bob.toString()] == '2,1,,31/1,1,,21'
        row.groupings.TEAM["${alice},${bob}".toString()] == '1,1,,21'
        again.group('PARTNER', bob.toString()).all().value('games') == 2d
        again.group('PARTNER', bob.toString()).ranked().value('wins') == 1d
    }

    def "a place entry with no grouping carries no groupings node"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.scope('COUNTRY', 1L, null).counters().add(Outcome.WIN, [:], stats)

        when:
        doc.writeTo(row)

        then:
        row.scopes[0].keySet() == ['scope', 'countryId', 'regionId', 'counters'] as Set
        row.scopes[0].counters == '1,1'
        PlayerStatsDoc.read(row).scope('COUNTRY', 1L, null).counters().value('games') == 1d
    }

    def "a place entry holds its own groupings, by dimension then key, counters only"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        def region = doc.scope('REGION', 1L, 2L)
        region.counters().add(Outcome.WIN, [:], stats)
        region.group('PARTNER', bob.toString()).add(Outcome.WIN, [:], stats)

        when:
        doc.writeTo(row)
        def entry = row.scopes[0]

        then:
        entry.keySet() == ['scope', 'countryId', 'regionId', 'counters', 'groupings'] as Set
        entry.scope == 'REGION'
        entry.countryId == 1
        entry.regionId == 2
        entry.counters == '1,1'
        entry.groupings.PARTNER[bob.toString()] == '1,1'
        PlayerStatsDoc.read(row).scope('REGION', 1L, 2L).group('PARTNER', bob.toString()).value('games') == 1d
    }

    def "a blob in a damaged shape reads as empty, and an empty group is written as an empty string"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.groupings = [TEAM: 'nonsense', PARTNER: [(bob.toString()): 'nonsense']]
        row.personal = [all: 'x']

        when:
        def doc = PlayerStatsDoc.read(row)
        doc.writeTo(row)

        then:
        row.groupings.PARTNER[bob.toString()] == ''
        !row.groupings.containsKey('TEAM')
        row.personal.all == ''
    }

    def "the object shapes of the first builds are still read and are written back as strings"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.personal = [all: [games: 3, wins: 1], ranked: [games: 1, wins: 1]]
        row.groupings = [PARTNER: [(bob.toString()): [all: [games: 2, wins: 1], ranked: [:]]]]

        when:
        def doc = PlayerStatsDoc.read(row)
        doc.writeTo(row)

        then:
        doc.personal().all().value('games') == 3d
        doc.group('PARTNER', bob.toString()).all().value('wins') == 1d
        row.personal == [all: '3,1', ranked: '1,1']
        row.groupings.PARTNER[bob.toString()] == '2,1'
    }

    def "a dimension stored with no group in it is not written back"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.groupings = [PARTNER: [:], TEAM: [("${alice},${bob}".toString()): '1,1/']]

        when:
        PlayerStatsDoc.read(row).writeTo(row)

        then:
        row.groupings.keySet() == ['TEAM'] as Set
        row.groupings.TEAM["${alice},${bob}".toString()] == '1,1'
    }

    def "a group member with no grouping has no groupings node"() {
        given:
        def row = new GroupMemberStats(5L, alice, 1L)
        def doc = GroupStatsDoc.read(row)
        doc.counters().add(Outcome.WIN, [scoreFor: 21d], stats)

        when:
        doc.writeTo(row)

        then:
        row.stats.keySet() == ['counters'] as Set
        GroupStatsDoc.read(row).counters().value('games') == 1d
        GroupStatsDoc.read(row).groupings() == [:]
    }

    def "a group member's stats are counters and groupings, with the history beside them, and no ranked split"() {
        given:
        def row = new GroupMemberStats(5L, alice, 1L)
        def doc = GroupStatsDoc.read(row)
        doc.counters().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('PARTNER', bob.toString()).add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('TEAM', "${alice},${bob}".toString()).add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.addPointer(7L, true)

        when:
        doc.writeTo(row)
        def again = GroupStatsDoc.read(row)

        then:
        row.stats.keySet() == ['counters', 'groupings'] as Set
        row.stats.counters == '1,1,,21'
        row.stats.groupings.keySet() == ['PARTNER', 'TEAM'] as Set
        row.stats.groupings.PARTNER[bob.toString()] == '1,1,,21'
        row.history == ['1-7']
        again.group('PARTNER', bob.toString()).value('wins') == 1d
        again.hasPointer(7L)
    }
}

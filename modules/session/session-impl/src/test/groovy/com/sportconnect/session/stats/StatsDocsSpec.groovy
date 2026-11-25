package com.sportconnect.session.stats

import com.sportconnect.session.record.RecordFacts.Outcome
import spock.lang.Specification

/**
 * SESSION-53: the jsonb shape of the statistics blobs, the one place it is written and read
 * (documentation/md/STATISTICS_JSONB_REFERENCE.md). The keys asserted here are the contract the read API and the client use.
 * The counters hold only the stats the sport collects (here games, wins and scoreFor).
 */
class StatsDocsSpec extends Specification {

    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    def stats = StatsCatalog.storedFor(StatsCatalog.forType('COMPETITIVE'), ['games', 'wins', 'scoreFor'])

    def "a new player row reads as no games and writes the documented keys"() {
        given:
        def row = new UserSportStats(alice, 1L)

        when:
        def doc = PlayerStatsDoc.read(row)
        doc.writeTo(row)

        then:
        row.personal.keySet() == ['all', 'ranked'] as Set
        row.personal.all == [:]
        row.personal.ranked == [:]
        row.groupings == [:]
        row.scopes == []
        row.history == []
    }

    def "personal counters hold only the collected stats, flat, for all games and for the ranking games among them"() {
        given:
        def row = new UserSportStats(alice, 1L)
        def doc = PlayerStatsDoc.read(row)
        doc.personal().all().add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 5d], stats)
        doc.personal().all().add(Outcome.LOSS, [scoreFor: 10d], stats)
        doc.personal().ranked().add(Outcome.WIN, [scoreFor: 21d], stats)

        when:
        doc.writeTo(row)

        then:
        row.personal.all == [games: 2, wins: 1, scoreFor: 31]
        row.personal.ranked == [games: 1, wins: 1, scoreFor: 21]
    }

    def "a player's groupings are by dimension then key, each with all and ranked, and read back unchanged"() {
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
        row.groupings.PARTNER[bob.toString()].all == [games: 2, wins: 1, scoreFor: 31]
        row.groupings.PARTNER[bob.toString()].ranked.games == 1
        row.groupings.TEAM["${alice},${bob}".toString()].all.games == 1
        again.group('PARTNER', bob.toString()).all().value('games') == 2d
        again.group('PARTNER', bob.toString()).ranked().value('wins') == 1d
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
        entry.counters.games == 1
        entry.groupings.PARTNER[bob.toString()].wins == 1
        PlayerStatsDoc.read(row).scope('REGION', 1L, 2L).group('PARTNER', bob.toString()).value('games') == 1d
    }

    def "a dimension with no group is not written, and a blob in an older or damaged shape reads as empty"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.groupings = [TEAM: 'nonsense', PARTNER: [(bob.toString()): 'nonsense']]
        row.personal = [all: 'x']

        when:
        def doc = PlayerStatsDoc.read(row)
        doc.writeTo(row)

        then:
        row.groupings.PARTNER[bob.toString()].all == [:]
        !row.groupings.containsKey('TEAM')
        row.personal.all == [:]
    }

    def "a dimension stored with no group in it is not written back"() {
        given:
        def row = new UserSportStats(alice, 1L)
        row.groupings = [PARTNER: [:], TEAM: [("${alice},${bob}".toString()): [all: [games: 1], ranked: [:]]]]

        when:
        PlayerStatsDoc.read(row).writeTo(row)

        then:
        row.groupings.keySet() == ['TEAM'] as Set
        row.groupings.TEAM["${alice},${bob}".toString()].all.games == 1
    }

    def "a group member's stats are counters and groupings, with the history beside them, and no ranked split"() {
        given:
        def row = new GroupMemberStats(5L, alice, 1L)
        def doc = GroupStatsDoc.read(row)
        doc.counters().add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('PARTNER', bob.toString()).add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.group('TEAM', "${alice},${bob}".toString()).add(Outcome.WIN, [scoreFor: 21d], stats)
        doc.addPointer(7L, 3L, true)

        when:
        doc.writeTo(row)
        def again = GroupStatsDoc.read(row)

        then:
        row.stats.keySet() == ['counters', 'groupings'] as Set
        row.stats.counters == [games: 1, wins: 1, scoreFor: 21]
        row.stats.groupings.keySet() == ['PARTNER', 'TEAM'] as Set
        row.stats.groupings.PARTNER[bob.toString()].games == 1
        row.history == [[recordId: 7, sessionId: 3, ranking: true]]
        again.group('PARTNER', bob.toString()).value('wins') == 1d
        again.hasPointer(7L)
    }
}

package com.sportconnect.session.stats

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupMemberNumberService
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.entity.Session
import com.sportconnect.session.record.CompetitiveRecordReader
import com.sportconnect.session.record.RecordFacts.Outcome
import com.sportconnect.session.record.RecordReaders
import com.sportconnect.session.record.SessionRecord
import com.sportconnect.session.record.SessionRecordRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.user.api.dto.UserSummaryResponse
import com.sportconnect.user.api.service.UserService
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant

/**
 * SESSION-73: the read side of the statistics, with every collaborator mocked: what each endpoint shows, who is listed, the
 * paging and the cursor, and that every lookup is one batch.
 */
class SessionStatisticsServiceSpec extends Specification {

    static final Long SPORT = 1L
    static final Long GROUP = 5L

    def sportService = Mock(SportService)
    def groupService = Mock(GroupService)
    def memberNumbers = Mock(GroupMemberNumberService)
    def userService = Mock(UserService)
    def userStatsRepository = Mock(UserSportStatsRepository)
    def groupStatsRepository = Mock(GroupMemberStatsRepository)
    def recordRepository = Mock(SessionRecordRepository)
    def sessionRepository = Mock(SessionRepository)
    def groupSettingsRepository = Mock(com.sportconnect.session.repository.GroupSessionSettingsRepository) {
        findById(_) >> Optional.empty()          // SESSION-84: the group has no stat list of its own unless a feature says so
    }

    @Subject
    def service = new SessionStatisticsServiceImpl(sportService, groupService, memberNumbers, userService, userStatsRepository,
            groupStatsRepository, recordRepository, sessionRepository, new RecordReaders([new CompetitiveRecordReader()]), groupSettingsRepository)

    def alice = UUID.fromString('00000000-0000-0000-0000-00000000000a')
    def bob = UUID.fromString('00000000-0000-0000-0000-00000000000b')
    def carol = UUID.fromString('00000000-0000-0000-0000-00000000000c')
    def dan = UUID.fromString('00000000-0000-0000-0000-00000000000d')
    def collected = StatisticsSchema.of(schema()).collected()
    def t1 = Instant.parse('2026-11-20T10:00:00Z')
    def t2 = Instant.parse('2026-11-22T10:00:00Z')
    def t3 = Instant.parse('2026-11-25T10:00:00Z')

    boolean statisticsOn = true
    Long groupSport = SPORT

    def setup() {
        sportService.isStatisticsEnabled(_) >> { statisticsOn }
        groupService.getGroup(_, _) >> { GroupResponse.builder().sportId(groupSport).build() }
    }

    /** The sport's schema: the catalog columns it lists and its one grouping (both replaceable through {@code scoreboard}). */
    Map schema(Map scoreboard = [:], boolean withScore = true) {
        def data = [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2]]
        if (withScore) {
            data.score = [slot: [[required: true]]]
        }
        def board = [columns: ['games', 'wins', 'scoreFor', 'scoreAgainst', 'winRate', 'winDiff'], groupBy: [[by: 'PARTNER']]]
        board.putAll(scoreboard)
        [record: [data: data, scoreboard: board]]
    }

    /** The group's member numbers of the four players (SESSION-81): a group's rows are keyed by these, not by user id. */
    Map<Integer, UUID> userOfNumber() {
        [(1): alice, (2): bob, (3): carol, (4): dan]
    }

    UserSummaryResponse user(UUID id, String name) {
        UserSummaryResponse.builder().id(id).fullName(name).avatarUrl("https://img/${name}.png".toString()).build()
    }

    def known() {
        [(alice): user(alice, 'Alice'), (bob): user(bob, 'Bob'), (carol): user(carol, 'Carol'), (dan): user(dan, 'Dan')]
    }

    /** A user_sport_stats row filled by the closure through the real document class, last updated at {@code at}. */
    UserSportStats playerRow(UUID user, Instant at, Closure fill) {
        def row = new UserSportStats(user, SPORT)
        def doc = PlayerStatsDoc.read(row)
        fill(doc)
        doc.writeTo(row)
        row.updatedAt = at
        row
    }

    GroupMemberStats groupRow(UUID user, Instant at, Closure fill) {
        def row = new GroupMemberStats(GROUP, user, SPORT)
        def doc = GroupStatsDoc.read(row)
        fill(doc)
        doc.writeTo(row)
        row.updatedAt = at
        row
    }

    void wins(StatsCounters c, int wins, int losses) {
        wins.times { c.add(Outcome.WIN, [scoreFor: 21d, scoreAgainst: 15d], collected) }
        losses.times { c.add(Outcome.LOSS, [scoreFor: 10d, scoreAgainst: 21d], collected) }
    }

    // ---- GET /api/stats/me ---------------------------------------------------------------------------------------------

    def "a player with no counted game gets no values, no groups and a null asOf, and no name lookup is made"() {
        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(new UserSportStats.Key(alice, SPORT)) >> Optional.empty()
        0 * userService._
        r.sportId() == SPORT
        r.asOf() == null
        r.columns() == ['games', 'wins', 'scoreFor', 'scoreAgainst', 'winRate', 'winDiff']
        r.totals().all().games == null
        r.totals().ranked().games == null
        r.totals().normal().games == null
        r.totals().all().winRate == null
        r.pairs() == []
        r.pairsTotal() == 0
        r.partners() == []
        r.partnersTotal() == 0
        r.scopes() == []
    }

    def "the columns are the catalog keys the sport lists, in its order, with unknown and repeated keys dropped"() {
        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(columns: ['winRate', 'nonsense', 'games', 'winRate'])
        1 * userStatsRepository.findById(_) >> Optional.empty()
        r.columns() == ['winRate', 'games']
        r.totals().all().keySet() as List == ['winRate', 'games']
    }

    def "while the sport's statistics are switched off nothing is shown, though a row exists"() {
        given:
        statisticsOn = false
        def row = playerRow(alice, t1) { doc ->
            wins(doc.personal().all(), 3, 1)
            wins(doc.group('PARTNER', bob.toString()).all(), 3, 1)
            wins(doc.scope('COUNTRY', 1L, null).counters(), 3, 1)
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        0 * sportService.getResultSchema(_)
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        0 * userService._
        r.columns() == []
        r.totals().all() == [:]
        r.totals().normal() == [:]
        r.partners() == []
        r.partnersTotal() == 0
        r.scopes()*.values() == [[:]]
    }

    def "the totals split into all, ranked and normal (all minus ranked), and asOf is the row's update time"() {
        given:
        def row = playerRow(alice, t2) { doc ->
            wins(doc.personal().all(), 3, 1)
            wins(doc.personal().ranked(), 1, 1)
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(new UserSportStats.Key(alice, SPORT)) >> Optional.of(row)
        r.asOf() == t2
        r.totals().all().games == 4d
        r.totals().all().wins == 3d
        r.totals().all().winRate == 0.75d
        r.totals().ranked().games == 2d
        r.totals().ranked().wins == 1d
        r.totals().normal().games == 2d
        r.totals().normal().wins == 2d
        r.totals().normal().winRate == 1d              // derived on the difference, not subtracted
        r.totals().normal().scoreFor == 42d          // SUM metric: all (3*21+10 = 73) minus ranked (21+10 = 31)
        r.totals().all().winDiff == 2d
        r.totals().normal().winDiff == 2d
    }

    def "a sport grouped by partner lists its partners, named by one batch lookup, most games first, and ignores stored pairs"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.personal().all(), 5, 0)
            wins(doc.group('PARTNER', bob.toString()).all(), 1, 0)
            wins(doc.group('PARTNER', carol.toString()).all(), 3, 1)
            wins(doc.group('PARTNER', carol.toString()).ranked(), 1, 0)
            wins(doc.group('TEAM', "${alice},${dan}".toString()).all(), 9, 0)       // from before a schema edit: not the sport's grouping now
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'PARTNER']])
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds({ it as Set == [bob, carol] as Set }) >> known()
        0 * userService.getUserSummariesByIds(_)
        r.partners().collect { it.players()*.id() } == [[carol], [bob]]
        r.partnersTotal() == 2
        r.partners()[0].players()[0].fullName() == 'Carol'
        r.partners()[0].players()[0].avatarUrl() == 'https://img/Carol.png'
        r.partners()[0].values().all().games == 4d
        r.partners()[0].values().ranked().games == 1d
        r.partners()[0].values().normal().games == 3d
        r.pairs() == []
        r.pairsTotal() == 0
    }

    def "a sport grouped by team lists its pairs, the asking player included, and ignores stored partners"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.personal().all(), 5, 0)
            wins(doc.group('TEAM', "${alice},${bob}".toString()).all(), 1, 0)
            wins(doc.group('TEAM', "${alice},${carol}".toString()).all(), 3, 1)
            wins(doc.group('PARTNER', dan.toString()).all(), 9, 0)                  // from before a schema edit: not the sport's grouping now
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'TEAM', size: 2]])
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds({ it as Set == [alice, bob, carol] as Set }) >> known()
        0 * userService.getUserSummariesByIds(_)
        r.pairs().collect { it.players()*.id() } == [[alice, carol], [alice, bob]]
        r.pairsTotal() == 2
        r.pairs()[0].values().all().wins == 3d
        r.partners() == []
        r.partnersTotal() == 0
    }

    def "a sport with an empty groupBy, or none at all, shows no pairs and no partners even when rows hold some"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.personal().all(), 5, 0)
            wins(doc.group('PARTNER', bob.toString()).all(), 3, 0)
            wins(doc.group('TEAM', "${alice},${carol}".toString()).all(), 3, 0)
        }

        and:
        def noKey = schema()
        noKey.record.scoreboard.remove('groupBy')

        when:
        def declaredNone = service.getMyStatistics(alice, SPORT, 0, 20)
        def noBlock = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [])
        1 * sportService.getResultSchema(SPORT) >> noKey
        2 * userStatsRepository.findById(_) >> Optional.of(row)
        0 * userService._
        [declaredNone, noBlock].every { it.pairs() == [] && it.partners() == [] && it.pairsTotal() == 0 && it.partnersTotal() == 0 }
        [declaredNone, noBlock].every { it.totals().all().games == 5d }
    }

    def "the partners are one page of the most played first, the total says how many there are, and only that page is named"() {
        given:
        def partnerIds = (1..150).collect { UUID.randomUUID() }
        def row = playerRow(alice, t1) { doc ->
            partnerIds.eachWithIndex { id, i -> wins(doc.group('PARTNER', id.toString()).all(), i + 1, 0) }   // 1 .. 150 games
        }

        when:
        def second = service.getMyStatistics(alice, SPORT, 1, 50)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'PARTNER']])
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds({ ids ->
            ids.containsAll(partnerIds[50..99]) && ids.size() == 50       // the 51st to the 100th most played
        }) >> [:]
        second.partners().size() == 50
        second.partnersTotal() == 150
        second.partners()[0].values().all().games == 100d
        second.partners()[49].values().all().games == 51d
    }

    def "a page past the end is empty, with the total still told and nobody named"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.group('PARTNER', bob.toString()).all(), 1, 0)
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 3, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        0 * userService._
        r.partners() == []
        r.partnersTotal() == 1
    }

    def "a page below 0 or a size outside 1 to 50 is a 400 before anything is read"() {
        when:
        service.getMyStatistics(alice, SPORT, page, size)

        then:
        0 * sportService._
        0 * userStatsRepository._
        thrown(BadRequestException)

        where:
        page | size
        -1   | 20
        0    | 0
        0    | 51
        0    | -3
    }

    def "the pairs are one page too, the most played first, with the asking player named once"() {
        given:
        def pairIds = (1..120).collect { UUID.randomUUID() }
        def row = playerRow(alice, t1) { doc ->
            pairIds.eachWithIndex { id, i -> wins(doc.group('TEAM', "${alice},${id}".toString()).all(), i + 1, 0) }   // 1 .. 120
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 1, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'TEAM', size: 2]])
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds({ ids ->
            ids.containsAll(pairIds[80..99]) && ids.size() == 20 + 1       // + alice
        }) >> [:]
        r.pairs().size() == 20
        r.pairsTotal() == 120
        r.pairs()[0].values().all().games == 100d
        r.pairs()[19].values().all().games == 81d
    }

    def "a grouping key that holds no player id is dropped, and an id the lookup does not know stays without a name"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.group('PARTNER', 'not-an-id').all(), 1, 0)
            wins(doc.group('PARTNER', dan.toString()).all(), 1, 0)
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds([dan]) >> [:]
        r.partners().size() == 1
        r.partners()[0].players()[0].id() == dan
        r.partners()[0].players()[0].fullName() == null
    }

    def "the scope entries carry the venue's ids and the ranking values, most games first"() {
        given:
        def row = playerRow(alice, t1) { doc ->
            wins(doc.scope('REGION', 1L, 11L).counters(), 3, 4)
            wins(doc.scope('REGION', 1L, 12L).counters(), 4, 6)
            wins(doc.scope('COUNTRY', 1L, null).counters(), 7, 10)
        }

        when:
        def r = service.getMyStatistics(alice, SPORT, 0, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        r.scopes()*.scope() == ['COUNTRY', 'REGION', 'REGION']
        r.scopes()*.regionId() == [null, 12L, 11L]
        r.scopes()*.countryId() == [1L, 1L, 1L]
        r.scopes()[0].values().games == 17d
        r.scopes()[0].values().wins == 7d
        r.scopes()[2].values().games == 7d
    }

    def "a missing or deactivated sport is refused before any row is read"() {
        when:
        service.getMyStatistics(alice, 99L, 0, 20)

        then:
        1 * sportService.isStatisticsEnabled(99L) >> { throw ResourceNotFoundException.coded('SPORT_NOT_FOUND', 'Sport not found', null) }
        0 * userStatsRepository._
        thrown(ResourceNotFoundException)
    }

    // ---- GET /api/stats/me/games ---------------------------------------------------------------------------------------

    def game(long id, long sessionId, List one, List two, scoreOne, scoreTwo) {
        SessionRecord.builder().id(id).sessionId(sessionId).data([teams: [
                [players: one*.toString(), scores: [scoreOne]], [players: two*.toString(), scores: [scoreTwo]]]]).build()
    }

    Session session(long id, String title, Instant start) {
        Session.builder().id(id).title(title).scheduledStart(start).build()
    }

    /** pointers are [record, session, ranking]: the record carries its own session, so the history keeps only record and mark */
    UserSportStats withHistory(List pointers) {
        playerRow(alice, t1) { doc ->
            pointers.reverse().each { p -> doc.addPointer(p[0] as long, p[2] as boolean) }
        }
    }

    def "a page of games, newest first, each with its session, ranking mark, outcome and named teams, all in single batches"() {
        given:
        def row = withHistory([[103, 12, false], [102, 11, true], [101, 10, true]])

        when:
        def page = service.getMyGames(alice, SPORT, null, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(new UserSportStats.Key(alice, SPORT)) >> Optional.of(row)
        1 * recordRepository.findAllById({ it as Set == [101L, 102L, 103L] as Set }) >> [
                game(101, 10, [alice, bob], [carol, dan], 21, 15),
                game(102, 11, [carol, dan], [alice, bob], 21, 18),
                game(103, 12, [alice, carol], [bob, dan], 21, 19)]
        1 * sessionRepository.findAllById({ it as Set == [10L, 11L, 12L] as Set }) >> [
                session(10, 'Monday', t1), session(11, '  ', t2), session(12, null, t3)]
        1 * userService.getUserSummariesByIds({ it as Set == [alice, bob, carol, dan] as Set }) >> known()
        0 * recordRepository._
        0 * sessionRepository._
        0 * userService.getUserSummariesByIds(_)
        page.nextCursor() == null
        page.games()*.recordId() == [103L, 102L, 101L]
        page.games()*.sessionId() == [12L, 11L, 10L]
        page.games()*.ranking() == [false, true, true]
        page.games()*.outcome() == ['WIN', 'LOSS', 'WIN']
        page.games()*.title() == [null, null, 'Monday']
        page.games()[0].playedAt() == t3
        page.games()[2].teams()[0].players()*.fullName() == ['Alice', 'Bob']
        page.games()[2].teams()[0].scores() == [21]
        page.games()[2].teams()[1].players()*.fullName() == ['Carol', 'Dan']
        page.games()[2].teams()[1].scores() == [15]
    }

    def "the cursor is the last record of the previous page, the next cursor is set while more remain"() {
        given:
        def row = withHistory([[105, 10, false], [104, 10, false], [103, 10, false], [102, 10, false], [101, 10, false]])

        when: "the first page of two"
        def first = service.getMyGames(alice, SPORT, null, 2)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * recordRepository.findAllById({ it as Set == [105L, 104L] as Set }) >> [
                game(105, 10, [alice, bob], [carol, dan], 21, 1), game(104, 10, [alice, bob], [carol, dan], 21, 2)]
        1 * sessionRepository.findAllById(_) >> [session(10, 'S', t1)]
        1 * userService.getUserSummariesByIds(_) >> known()
        first.games()*.recordId() == [105L, 104L]
        first.nextCursor() == 104L

        when: "the second page continues after the cursor"
        def second = service.getMyGames(alice, SPORT, 104L, 2)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * recordRepository.findAllById({ it as Set == [103L, 102L] as Set }) >> [
                game(103, 10, [alice, bob], [carol, dan], 21, 3), game(102, 10, [alice, bob], [carol, dan], 21, 4)]
        1 * sessionRepository.findAllById(_) >> [session(10, 'S', t1)]
        1 * userService.getUserSummariesByIds(_) >> known()
        second.games()*.recordId() == [103L, 102L]
        second.nextCursor() == 102L

        when: "the last page has no next cursor"
        def last = service.getMyGames(alice, SPORT, 102L, 2)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * recordRepository.findAllById([101L]) >> [game(101, 10, [alice, bob], [carol, dan], 21, 5)]
        1 * sessionRepository.findAllById(_) >> [session(10, 'S', t1)]
        1 * userService.getUserSummariesByIds(_) >> known()
        last.games()*.recordId() == [101L]
        last.nextCursor() == null
    }

    def "a cursor that has left the history ends the list"() {
        given:
        def row = withHistory([[103, 10, false], [102, 10, false]])

        when:
        def page = service.getMyGames(alice, SPORT, 55L, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        0 * recordRepository._
        0 * userService._
        page.games() == []
        page.nextCursor() == null
    }

    def "a pointer whose record or session is gone is skipped, and the next cursor still follows the pointers"() {
        given:
        def row = withHistory([[103, 10, false], [102, 10, false], [101, 99, false]])

        when:
        def page = service.getMyGames(alice, SPORT, null, 2)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * recordRepository.findAllById(_) >> [game(103, 10, [alice, bob], [carol, dan], 21, 15)]   // 102 is gone
        1 * sessionRepository.findAllById(_) >> [session(10, 'S', t1)]
        1 * userService.getUserSummariesByIds(_) >> known()
        page.games()*.recordId() == [103L]
        page.nextCursor() == 102L
    }

    def "a player with no history gets an empty page and nothing is looked up"() {
        when:
        def page = service.getMyGames(alice, SPORT, null, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * userStatsRepository.findById(_) >> Optional.empty()
        0 * recordRepository._
        0 * sessionRepository._
        0 * userService._
        page.games() == []
        page.nextCursor() == null
    }

    def "a size outside 1 to 50 is a 400, before anything is read"() {
        when:
        service.getMyGames(alice, SPORT, null, size)

        then:
        0 * sportService._
        0 * userStatsRepository._
        thrown(BadRequestException)

        where:
        size << [0, -1, 51, 1000]
    }

    def "the outcome is empty when the sport's schema has no reader for the record type any more, the teams still show"() {
        given:
        def row = withHistory([[101, 10, true]])

        when:
        def page = service.getMyGames(alice, SPORT, null, 20)

        then:
        1 * sportService.getResultSchema(SPORT) >> [record: [data: [type: 'UNKNOWN_TYPE']]]       // no reader reads it any more
        1 * userStatsRepository.findById(_) >> Optional.of(row)
        1 * recordRepository.findAllById(_) >> [game(101, 10, [alice, bob], [carol, dan], 21, 15)]
        1 * sessionRepository.findAllById(_) >> [session(10, 'S', t1)]
        1 * userService.getUserSummariesByIds(_) >> known()
        page.games()[0].outcome() == null
        page.games()[0].ranking()
        page.games()[0].teams()[0].players()*.fullName() == ['Alice', 'Bob']
    }

    // ---- GET /api/sessions/group/{groupId}/stats ---------------------------------------------------------------------

    def "a non-member, or a group that does not exist, gets one 403 before anything else is read"() {
        when:
        service.getGroupStatistics(GROUP, carol, PageRequest.of(0, 20))

        then:
        1 * groupService.isGroupMember(GROUP, carol) >> false
        0 * sportService._
        0 * groupStatsRepository._
        0 * userService._
        def e = thrown(ForbiddenException)
        e.errorCode == 'SESSION_GROUP_MEMBER_REQUIRED'
    }

    def "the list has the current, active members with a row, most games first, and asOf is the newest among them"() {
        given:
        def rows = [
                groupRow(alice, t1) { d -> wins(d.counters(), 2, 1) },                 // 3 games, 2 wins
                groupRow(bob, t2) { d -> wins(d.counters(), 3, 0) },                   // 3 games, 3 wins
                groupRow(carol, t3) { d -> wins(d.counters(), 10, 0) },                // deactivated
                groupRow(dan, t3) { d -> wins(d.counters(), 9, 0) }]                   // has left the group

        when:
        def r = service.getGroupStatistics(GROUP, alice, PageRequest.of(0, 20))

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findByGroupIdAndSportId(GROUP, SPORT) >> rows
        1 * groupService.getMemberUserIds(GROUP) >> [alice, bob, carol]
        1 * userService.getActiveUserIds({ it as Set == [alice, bob, carol] as Set }) >> ([alice, bob] as Set)
        1 * userService.getUserSummariesByIds({ it as Set == [alice, bob] as Set }) >> known()
        r.sportId() == SPORT
        r.columns() == ['games', 'wins', 'scoreFor', 'scoreAgainst', 'winRate', 'winDiff']
        r.members().content*.member()*.fullName() == ['Bob', 'Alice']
        r.members().content[0].values().games == 3d
        r.members().content[0].values().wins == 3d
        r.members().content[0].values().winRate == 1d
        r.members().totalElements == 2
        r.asOf() == t2          // carol's and dan's newer rows are not listed, so they do not count
    }

    def "the list is paged, the page size is capped at 50, and asOf covers every page"() {
        given:
        def ids = (1..7).collect { UUID.randomUUID() }
        def rows = ids.withIndex().collect { id, i ->
            groupRow(id, Instant.parse('2026-11-20T10:00:00Z').plusSeconds(i * 60)) { d -> wins(d.counters(), 10 - i, 0) }
        }

        when:
        def second = service.getGroupStatistics(GROUP, alice, PageRequest.of(1, 3))

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findByGroupIdAndSportId(GROUP, SPORT) >> rows
        1 * groupService.getMemberUserIds(GROUP) >> ids
        1 * userService.getActiveUserIds(_) >> (ids as Set)
        1 * userService.getUserSummariesByIds({ it as Set == ids[3..5] as Set }) >> [:]
        second.members().content.size() == 3
        second.members().content*.member()*.id() == ids[3..5]      // 10-i games: the 4th to 6th most
        second.members().totalElements == 7
        second.members().totalPages == 3
        second.members().number == 1
        second.asOf() == Instant.parse('2026-11-20T10:06:00Z')

        when:
        def big = service.getGroupStatistics(GROUP, alice, PageRequest.of(0, 500))

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findByGroupIdAndSportId(GROUP, SPORT) >> rows
        1 * groupService.getMemberUserIds(GROUP) >> ids
        1 * userService.getActiveUserIds(_) >> (ids as Set)
        1 * userService.getUserSummariesByIds(_) >> [:]
        big.members().size == 50
        big.members().content.size() == 7
    }

    def "a group with no counted game has an empty list, and no active-account lookup is made"() {
        when:
        def r = service.getGroupStatistics(GROUP, alice, PageRequest.of(0, 20))

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findByGroupIdAndSportId(GROUP, SPORT) >> []
        1 * groupService.getMemberUserIds(GROUP) >> [alice, bob]
        0 * userService._
        r.members().content == []
        r.members().totalElements == 0
        r.asOf() == null
    }

    // ---- GET /api/sessions/group/{groupId}/stats/members/{userId} -------------------------------------------------------

    def "a non-member cannot read a member's detail"() {
        when:
        service.getGroupMemberStatistics(GROUP, carol, alice, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, carol) >> false
        0 * sportService._
        0 * groupStatsRepository._
        thrown(ForbiddenException)
    }

    def "the detail of a team-grouped sport has the member's totals and pairs, most games first, named by one lookup, and ignores stored partners"() {
        given:
        def row = groupRow(bob, t2) { d ->
            wins(d.counters(), 4, 2)
            wins(d.group('TEAM', '1,2'), 1, 0)            // alice and bob, by their group member numbers
            wins(d.group('TEAM', '2,3'), 3, 2)            // bob and carol
            wins(d.group('PARTNER', '4'), 1, 0)           // from before a schema edit: not the sport's grouping now
        }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, bob, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'TEAM', size: 2]])
        1 * groupStatsRepository.findById(new GroupMemberStats.Key(GROUP, bob, SPORT)) >> Optional.of(row)
        1 * memberNumbers.getUserIdsByMemberNumbers(GROUP, { it as Set == [1, 2, 3] as Set }) >> userOfNumber()
        1 * userService.getUserSummariesByIds({ it as Set == [alice, bob, carol] as Set }) >> known()
        0 * userService.getUserSummariesByIds(_)
        r.member().fullName() == 'Bob'
        r.totals().games == 6d
        r.totals().wins == 4d
        r.totals().winRate == 4d / 6d
        r.asOf() == t2
        r.pairs().collect { it.players()*.id() } == [[bob, carol], [alice, bob]]
        r.pairsTotal() == 2
        r.pairs()[0].values().games == 5d
        r.pairs()[0].values().wins == 3d
        r.pairs()[1].players()*.fullName() == ['Alice', 'Bob']
        r.partners() == []
        r.partnersTotal() == 0
    }

    def "the detail of a partner-grouped sport has the member's partners and no pairs, and ignores stored pairs"() {
        given:
        def row = groupRow(bob, t2) { d ->
            wins(d.counters(), 4, 2)
            wins(d.group('PARTNER', '1'), 1, 0)            // alice
            wins(d.group('PARTNER', '3'), 3, 2)            // carol
            wins(d.group('TEAM', '2,4'), 9, 0)             // from before a schema edit
        }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, bob, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'PARTNER']])
        1 * groupStatsRepository.findById(_) >> Optional.of(row)
        1 * memberNumbers.getUserIdsByMemberNumbers(GROUP, { it as Set == [1, 3] as Set }) >> userOfNumber()
        1 * userService.getUserSummariesByIds({ it as Set == [alice, bob, carol] as Set }) >> known()
        r.partners().collect { it.players()*.id() } == [[carol], [alice]]
        r.partnersTotal() == 2
        r.partners()[0].values().games == 5d
        r.partners()[1].players()[0].fullName() == 'Alice'
        r.pairs() == []
        r.pairsTotal() == 0
    }

    def "the detail of a sport with no groupBy shows no pairs and no partners even when the row holds some"() {
        given:
        def row = groupRow(bob, t2) { d ->
            wins(d.counters(), 4, 2)
            wins(d.group('PARTNER', alice.toString()), 1, 0)
            wins(d.group('TEAM', "${bob},${carol}".toString()), 3, 2)
        }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, bob, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [])
        1 * groupStatsRepository.findById(_) >> Optional.of(row)
        1 * userService.getUserSummariesByIds([bob]) >> known()
        r.totals().games == 6d
        r.pairs() == []
        r.partners() == []
        r.pairsTotal() == 0
        r.partnersTotal() == 0
    }

    def "a member's partners are one page, the most played first, with the total told"() {
        given:
        def others = (1..130).collect { UUID.randomUUID() }
        def row = groupRow(bob, t1) { d ->
            others.eachWithIndex { id, i -> wins(d.group('PARTNER', "${i + 11}".toString()), i + 1, 0) }       // member numbers 11 .. 140
        }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, bob, 2, 50)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'PARTNER']])
        1 * groupStatsRepository.findById(_) >> Optional.of(row)
        1 * memberNumbers.getUserIdsByMemberNumbers(GROUP, { nums -> nums.size() == 30 }) >> { gid, nums -> nums.collectEntries { n -> [(n): others[n - 11]] } }
        1 * userService.getUserSummariesByIds({ ids -> ids.containsAll(others[0..29]) && ids.size() == 30 + 1 }) >> [:]   // the 101st to the 130th, and bob
        r.partners().size() == 30
        r.partnersTotal() == 130
        r.partners()[0].values().games == 30d
        r.partners()[29].values().games == 1d
        r.pairs() == []
        r.pairsTotal() == 0
    }

    def "a member's detail refuses a bad page or size after the member gate and before any read"() {
        when:
        service.getGroupMemberStatistics(GROUP, alice, bob, page, size)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        0 * sportService._
        0 * groupStatsRepository._
        thrown(BadRequestException)

        where:
        page | size
        -1   | 20
        0    | 0
        0    | 51
    }

    def "a member's pairs are one page too"() {
        given:
        def others = (1..130).collect { UUID.randomUUID() }
        def row = groupRow(bob, t1) { d ->
            others.eachWithIndex { id, i -> wins(d.group('TEAM', "2,${i + 11}".toString()), i + 1, 0) }       // bob is number 2, the others 11 .. 140
        }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, bob, 0, 25)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema(groupBy: [[by: 'TEAM', size: 2]])
        1 * groupStatsRepository.findById(_) >> Optional.of(row)
        1 * memberNumbers.getUserIdsByMemberNumbers(GROUP, { nums -> nums.size() == 26 }) >> { gid, nums -> nums.collectEntries { n -> [(n): n == 2 ? bob : others[n - 11]] } }
        1 * userService.getUserSummariesByIds({ ids -> ids.containsAll(others[105..129]) && ids.size() == 25 + 1 }) >> [:]
        r.pairs().size() == 25
        r.pairsTotal() == 130
        r.pairs()[0].values().games == 130d
        r.pairs()[24].values().games == 106d
    }

    def "a group with no sport has no statistics: 400 SESSION_SPORT_REQUIRED after the member gate, for the list and the detail"() {
        given:
        groupSport = null

        when:
        service.getGroupStatistics(GROUP, alice, PageRequest.of(0, 20))

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        0 * groupStatsRepository._
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_SPORT_REQUIRED'

        when:
        service.getGroupMemberStatistics(GROUP, alice, bob, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        0 * groupStatsRepository._
        thrown(BadRequestException)
    }

    def "a member who left the group or was deactivated is still shown, with no membership or active check"() {
        given:
        def row = groupRow(dan, t1) { d -> wins(d.counters(), 2, 0) }

        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, dan, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findById(new GroupMemberStats.Key(GROUP, dan, SPORT)) >> Optional.of(row)
        1 * userService.getUserSummariesByIds([dan]) >> [(dan): user(dan, 'Dan (deactivated)')]
        0 * groupService.getMemberUserIds(_)
        0 * userService.getActiveUserIds(_)
        r.member().fullName() == 'Dan (deactivated)'
        r.totals().games == 2d
        r.pairs() == []
    }

    def "a member with no row gets no values and a null asOf, and an unknown account stays without a name"() {
        when:
        def r = service.getGroupMemberStatistics(GROUP, alice, dan, 0, 20)

        then:
        1 * groupService.isGroupMember(GROUP, alice) >> true
        1 * sportService.getResultSchema(SPORT) >> schema()
        1 * groupStatsRepository.findById(_) >> Optional.empty()
        1 * userService.getUserSummariesByIds([dan]) >> [:]
        r.member().id() == dan
        r.member().fullName() == null
        r.totals().games == null
        r.totals().winRate == null
        r.pairs() == []
        r.asOf() == null
    }
}

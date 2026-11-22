package com.sportconnect.session.importer

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.ImportApplyResponse
import com.sportconnect.session.api.dto.ImportSessionsRequest
import com.sportconnect.session.entity.Session
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

/**
 * SESSION-70: the plan of an import (the checks of the request, the match of every name) and what apply does with it. Every
 * collaborator is mocked; the real-pipeline boundary is {@code SessionImportIntegrationTest}.
 */
class SessionImportServiceImplSpec extends Specification {

    GroupService groupService = Mock()
    UserService userService = Mock()
    LocationService locationService = Mock()
    SportService sportService = Mock()
    SessionRepository sessionRepository = Mock()
    SessionImportWriter writer = Mock()

    @Subject
    SessionImportServiceImpl service = new SessionImportServiceImpl(
            groupService, userService, locationService, sportService, sessionRepository, writer)

    UUID admin = UUID.randomUUID()
    UUID groupOwner = UUID.randomUUID()
    UUID hieu = UUID.randomUUID()
    UUID anhA = UUID.randomUUID()
    UUID anhB = UUID.randomUUID()
    UUID duc = UUID.randomUUID()
    UUID gone = UUID.randomUUID()
    Long groupId = 46L
    Long sportId = 1L
    Long locationId = 7L

    def setup() {
        service.clock = Clock.fixed(Instant.parse('2026-11-22T00:00:00Z'), ZoneOffset.UTC)
        groupService.isGroupActive(groupId) >> true
        groupService.getGroupOwnerId(groupId) >> groupOwner
        groupService.getGroup(groupId, groupOwner) >> GroupResponse.builder().id(groupId).sportId(sportId).build()
        locationService.getLocation(locationId) >> LocationResponse.builder().id(locationId).sportId(sportId)
                .timezone('Asia/Ho_Chi_Minh').build()
        groupService.getMemberUserIds(groupId) >> [groupOwner, hieu, anhA, anhB, duc, gone]
        // `gone` is a deactivated member: not in the active set.
        userService.getActiveUserIds(_) >> ([groupOwner, hieu, anhA, anhB, duc] as Set)
        userService.getUsersByIds(_) >> [
                (groupOwner): user('Bảo', 'Nguyễn'),
                (hieu) : user('Hiếu', 'Nguyễn'),
                (anhA) : user('Ánh', 'Nguyễn'),
                (anhB) : user('Ánh', 'Vãng Lai'),
                (duc)  : user('Đức', 'Trần'),
                (gone) : user('Gone', 'Person')]
        sportService.getResultSchema(sportId) >> [maxRecords: 50, record: [data: [playersPerSide: [min: 1, max: 2]]]]
        sessionRepository.findByGroupIdAndScheduledStartIn(_, _) >> []
    }

    private static Session existing(String title, String start) {
        Session.builder().title(title).scheduledStart(Instant.parse(start)).build()
    }

    private static UserResponse user(String first, String last) {
        UserResponse.builder().firstName(first).lastName(last).build()
    }

    private static ImportSessionsRequest.ImportedGame game(List<String> w, List<String> l) {
        ImportSessionsRequest.ImportedGame.builder().winners(w).losers(l).build()
    }

    private ImportSessionsRequest.ImportedSession session(Map overrides = [:]) {
        def s = ImportSessionsRequest.ImportedSession.builder()
                .title("BkBg's session on 29th, Oct 2026").localDate(LocalDate.of(2026, 10, 29))
                .startTime(LocalTime.of(7, 0)).endTime(LocalTime.of(9, 0))
                .games(oneGame(['Hiếu', 'Đức'], ['Bảo'])).build()
        overrides.each { k, v -> s."$k" = v }
        s
    }

    private ImportSessionsRequest request(List sessions, Map overrides = [:]) {
        def r = ImportSessionsRequest.builder().groupId(groupId).locationId(locationId).sessions(sessions).build()
        overrides.each { k, v -> r."$k" = v }
        r
    }

    private static List<ImportSessionsRequest.ImportedGame> oneGame(List<String> w, List<String> l) {
        [ImportSessionsRequest.ImportedGame.builder().winners(w).losers(l).build()]
    }

    // ---- names ----------------------------------------------------------------------------------------------------

    def "a name matches the member's first name ignoring accents and case"() {
        when:
        def preview = service.preview(admin, request([session(games: oneGame(['hieu', 'DUC'], ['bao']))]))

        then:
        preview.canApply
        preview.unresolved.isEmpty()
        def g = preview.sessions[0].games[0]
        g.winners*.userId == [hieu, duc]
        g.losers*.userId == [groupOwner]
        g.winners[0].name == 'hieu'
        g.winners[0].fullName == 'Hiếu Nguyễn'
    }

    def "a first name shared by two members is unresolved with both candidates"() {
        when:
        def preview = service.preview(admin, request([session(games: oneGame(['Ánh', 'Hiếu'], ['Bảo']))]))

        then:
        !preview.canApply
        preview.unresolved.size() == 1
        preview.unresolved[0].name == 'Ánh'
        preview.unresolved[0].candidates*.userId as Set == [anhA, anhB] as Set
        preview.sessions[0].games[0].winners[0].userId == null
    }

    def "a name that is nobody's first name is unresolved with no candidates, once however often it appears"() {
        when:
        def preview = service.preview(admin, request([session(games: [
                game(['Anh_VL'], ['Bảo']), game(['Anh_VL', 'Hiếu'], ['Đức'])])]))

        then:
        preview.unresolved.size() == 1
        preview.unresolved[0].name == 'Anh_VL'
        preview.unresolved[0].candidates.isEmpty()
    }

    def "an alias settles a name the first-name match cannot"() {
        when:
        def preview = service.preview(admin, request(
                [session(games: oneGame(['Ánh', 'Anh_VL'], ['Bảo']))], [aliases: ['Ánh': anhA, 'Anh_VL': anhB]]))

        then:
        preview.canApply
        preview.sessions[0].games[0].winners*.userId == [anhA, anhB]
    }

    def "an alias to someone who is not an active member of the group is refused"() {
        when:
        service.preview(admin, request([session()], [aliases: ['Ánh': stranger]]))

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_ALIAS_NOT_MEMBER'

        where:
        stranger << [UUID.randomUUID(), null]
    }

    def "a deactivated member is never a candidate"() {
        when:
        def preview = service.preview(admin, request([session(games: oneGame(['Gone'], ['Bảo']))]))

        then:
        preview.unresolved*.name == ['Gone']
        preview.unresolved[0].candidates.isEmpty()
    }

    // ---- host, group, location ------------------------------------------------------------------------------------

    def "the preview lists the group's active members by name, never a deactivated one"() {
        when:
        def preview = service.preview(admin, request([session()]))

        then: 'sorted without accents; Gone (deactivated) is absent'
        preview.members*.userId == [anhA, anhB, groupOwner, duc, hieu]
        preview.members*.fullName == ['Ánh Nguyễn', 'Ánh Vãng Lai', 'Bảo Nguyễn', 'Đức Trần', 'Hiếu Nguyễn']
        !(gone in preview.members*.userId)
    }

    def "the host defaults to the group's owner"() {
        expect:
        service.preview(admin, request([session()])).hostUserId == groupOwner
    }

    def "a host who is not an active member is refused"() {
        when:
        service.preview(admin, request([session()], [hostUserId: gone]))

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_HOST_NOT_MEMBER'
    }

    def "a member can be the host"() {
        expect:
        service.preview(admin, request([session()], [hostUserId: hieu])).hostUserId == hieu
    }

    def "a missing or inactive group is GROUP_NOT_FOUND"() {
        when:
        service.preview(admin, request([session()], [groupId: 99L]))

        then:
        1 * groupService.isGroupActive(99L) >> false
        def e = thrown(ResourceNotFoundException)
        e.errorCode == 'GROUP_NOT_FOUND'
    }

    def "a location of another sport is refused"() {
        when:
        service.preview(admin, request([session()]))

        then:
        1 * locationService.getLocation(locationId) >> LocationResponse.builder().id(locationId).sportId(2L).timezone('Asia/Ho_Chi_Minh').build()
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_LOCATION_SPORT_MISMATCH'
    }

    def "a location with no timezone is refused"() {
        when:
        service.preview(admin, request([session()]))

        then:
        1 * locationService.getLocation(locationId) >> LocationResponse.builder().id(locationId).sportId(sportId).build()
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_INVALID'
        e.errorParams.reason == 'LOCATION_TIMEZONE'
    }

    // ---- the sessions ---------------------------------------------------------------------------------------------

    def "the local date and times are read in the location's timezone and stored as UTC"() {
        when:
        def s = service.preview(admin, request([session()])).sessions[0]

        then: 'Vietnam is UTC+7: 07:00-09:00 local is 00:00-02:00 UTC the same day'
        s.scheduledStart == Instant.parse('2026-10-29T00:00:00Z')
        s.scheduledEndAt == Instant.parse('2026-10-29T02:00:00Z')
        s.title == "BkBg's session on 29th, Oct 2026"
    }

    def "a session that has not ended yet is refused"() {
        when:
        service.preview(admin, request([session(localDate: LocalDate.of(2026, 11, 22), startTime: LocalTime.of(6, 0), endTime: LocalTime.of(9, 0))]))

        then: 'the fixed clock is 07:00 local on 22 Nov'
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_NOT_FINISHED'
    }

    @Unroll
    def "an invalid session is refused: #reason"() {
        when:
        service.preview(admin, request([session(change)]))

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_INVALID'
        e.errorParams.reason == reason

        where:
        reason               | change
        'SESSION_INCOMPLETE' | [title: '  ']
        'SESSION_INCOMPLETE' | [localDate: null]
        'END_NOT_AFTER_START'| [endTime: LocalTime.of(7, 0)]
        'GAME_COUNT'         | [games: []]
        'GAME_COUNT'         | [games: (1..51).collect { game(['Hiếu'], ['Bảo']) }]
        'SIDE_SIZE'          | [games: oneGame(['Hiếu', 'Đức', 'Bảo'], ['Bảo'])]
        'SIDE_SIZE'          | [games: oneGame([], ['Bảo'])]
        'NAME_BLANK'         | [games: oneGame(['Hiếu', ' '], ['Bảo'])]
        'DUPLICATE_PLAYER'   | [games: oneGame(['Hiếu', 'Đức'], ['Hiếu'])]
    }

    @Unroll
    def "a request with #what is refused"() {
        when:
        service.preview(admin, request(sessionCount == 0 ? [] : (1..sessionCount).collect { session() }, overrides))

        then:
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_IMPORT_INVALID'

        where:
        what                | sessionCount | overrides
        'no group'          | 1            | [groupId: null]
        'no location'       | 1            | [locationId: null]
        'no sessions'       | 0            | [:]
        'over 100 sessions' | 101          | [:]
    }

    def "the preview says which sessions already exist and writes nothing"() {
        when:
        def preview = service.preview(admin, request([session()]))

        then:
        1 * sessionRepository.findByGroupIdAndScheduledStartIn(groupId, [Instant.parse('2026-10-29T00:00:00Z')] as Set) >> [existing("BkBg's session on 29th, Oct 2026", '2026-10-29T00:00:00Z')]
        preview.sessions[0].exists
        0 * writer._
    }

    // ---- apply ----------------------------------------------------------------------------------------------------

    def "apply refuses the whole call while a name is unresolved and writes nothing"() {
        when:
        service.apply(admin, request([session(), session(title: 'second', games: oneGame(['Ánh'], ['Bảo']))]))

        then:
        def e = thrown(ConflictException)
        e.errorCode == 'SESSION_IMPORT_UNRESOLVED_NAMES'
        e.errorParams.names == ['Ánh']
        0 * writer._
    }

    def "apply creates each session through the writer with the resolved ids, host, group, sport and location"() {
        when:
        def result = service.apply(admin, request([session()], [hostUserId: hieu]))

        then:
        1 * writer.write({ SessionImportWriter.Item item ->
            item.title() == "BkBg's session on 29th, Oct 2026" &&
                    item.start() == Instant.parse('2026-10-29T00:00:00Z') &&
                    item.end() == Instant.parse('2026-10-29T02:00:00Z') &&
                    item.games().size() == 1 &&
                    item.games()[0].winners() == [hieu, duc] &&
                    item.games()[0].losers() == [groupOwner]
        }, groupId, sportId, locationId, hieu) >> 501L
        result.created == 1
        result.skipped == 0
        result.failed == 0
        result.results[0].status == ImportApplyResponse.Status.CREATED
        result.results[0].sessionId == 501L
    }

    def "a session already there is skipped, not written again"() {
        when:
        def result = service.apply(admin, request([session()]))

        then:
        1 * sessionRepository.findByGroupIdAndScheduledStartIn(groupId, _) >> [existing("BkBg's session on 29th, Oct 2026", '2026-10-29T00:00:00Z')]
        0 * writer._
        result.skipped == 1
        result.created == 0
        result.results[0].status == ImportApplyResponse.Status.SKIPPED
        result.results[0].sessionId == null
    }

    def "one session failing does not stop the others and is reported FAILED"() {
        when:
        def result = service.apply(admin, request([
                session(title: 'first'), session(title: 'second'), session(title: 'third')]))

        then:
        1 * writer.write({ it.title() == 'first' }, *_) >> 1L
        1 * writer.write({ it.title() == 'second' }, *_) >> { throw new IllegalStateException('boom') }
        1 * writer.write({ it.title() == 'third' }, *_) >> 3L
        result.created == 2
        result.failed == 1
        result.results*.status == [ImportApplyResponse.Status.CREATED, ImportApplyResponse.Status.FAILED, ImportApplyResponse.Status.CREATED]
    }

    def "the existing sessions of the whole batch are looked up in one query, not one per session"() {
        when:
        service.apply(admin, request((1..5).collect { i -> session(title: "t$i", localDate: LocalDate.of(2026, 10, i)) }))

        then:
        1 * sessionRepository.findByGroupIdAndScheduledStartIn(groupId, { it.size() == 5 }) >> []
        5 * writer.write(*_) >> 1L
        0 * sessionRepository._
    }

    def "a same title and start repeated inside one batch is written once, then skipped"() {
        when:
        def result = service.apply(admin, request([session(), session()]))

        then:
        1 * writer.write(*_) >> 1L
        result.created == 1
        result.skipped == 1
    }

    def "a session of the same start with another title is not a repeat"() {
        when:
        def result = service.apply(admin, request([session(title: 'other')]))

        then:
        1 * sessionRepository.findByGroupIdAndScheduledStartIn(groupId, _) >> [existing("BkBg's session on 29th, Oct 2026", '2026-10-29T00:00:00Z')]
        1 * writer.write(*_) >> 1L
        result.created == 1
    }
}

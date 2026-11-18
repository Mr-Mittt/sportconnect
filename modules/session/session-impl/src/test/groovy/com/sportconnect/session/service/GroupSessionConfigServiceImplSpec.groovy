package com.sportconnect.session.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.api.dto.GroupAudience
import com.sportconnect.session.api.dto.GroupSessionRecurrenceRequest
import com.sportconnect.session.api.dto.RecurrenceMode
import com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest
import com.sportconnect.session.entity.GroupSessionRecurrence
import com.sportconnect.session.entity.GroupSessionRecurrenceMember
import com.sportconnect.session.entity.GroupSessionSettings
import com.sportconnect.session.repository.GroupSessionRecurrenceMemberRepository
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository
import com.sportconnect.session.repository.GroupSessionSettingsRepository
import com.sportconnect.social.post.api.dto.SystemCode
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.user.api.dto.UserSummaryResponse
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalTime

/**
 * SESSION-GROUP-4: a group's regular-session settings and recurrence configurations. Every collaborator is mocked; the
 * real-pipeline boundary (permissions, the real tables, the group post) is {@code GroupSessionConfigIntegrationTest}.
 */
class GroupSessionConfigServiceImplSpec extends Specification {

    GroupSessionSettingsRepository settingsRepository = Mock()
    GroupSessionRecurrenceRepository recurrenceRepository = Mock()
    GroupSessionRecurrenceMemberRepository memberRepository = Mock()
    GroupService groupService = Mock()
    LocationService locationService = Mock()
    PostService postService = Mock()
    UserService userService = Mock()
    SessionAttributeResolver attributeResolver = Mock()

    @Subject
    GroupSessionConfigServiceImpl service = new GroupSessionConfigServiceImpl(
            settingsRepository, recurrenceRepository, memberRepository, groupService, locationService, postService,
            userService, attributeResolver)

    UUID admin = UUID.randomUUID()
    UUID owner = UUID.randomUUID()

    def setup() {
        // Lenient defaults: an active group, the caller an admin, the actor's name, a group with sport 1.
        groupService.isGroupActive(5L) >> true
        groupService.canManageMembers(5L, admin) >> true
        groupService.isGroupMember(5L, admin) >> true
        groupService.getGroupOwnerId(5L) >> owner
        groupService.getGroup(5L, admin) >> GroupResponse.builder().id(5L).sportId(1L).build()
        userService.getUserSummariesByIds([admin]) >> [(admin): UserSummaryResponse.builder().id(admin).fullName("Alice Admin").build()]
        recurrenceRepository.save(_ as GroupSessionRecurrence) >> { GroupSessionRecurrence r -> r.id = r.id ?: 77L; r }
    }

    private GroupSessionRecurrenceRequest.GroupSessionRecurrenceRequestBuilder complete() {
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(18, 30)).durationMinutes(90).locationId(9L)
    }

    private GroupSessionRecurrence stored(Map args = [:]) {
        GroupSessionRecurrence.builder().id(77L).groupId(5L).mode(args.mode ?: RecurrenceMode.WEEKLY).dayKey(args.dayKey ?: 1)
                .startTime(LocalTime.of(18, 30)).durationMinutes(90).locationId(9L).build()
    }

    // ---- access ---------------------------------------------------------------------------------------------------

    def "every call on an inactive group is 404 GROUP_NOT_FOUND, before any permission answer"() {
        given:
        def request = complete().build()

        when:
        call.call(service, request)

        then:
        1 * groupService.isGroupActive(5L) >> false
        def e = thrown(ResourceNotFoundException)
        e.errorCode == 'GROUP_NOT_FOUND'
        0 * groupService.isGroupMember(*_)
        0 * groupService.canManageMembers(*_)
        0 * recurrenceRepository.save(_)
        0 * postService._

        where:
        call << [
                { s, r -> s.getSettings(5L, UUID.randomUUID()) },
                { s, r -> s.updateSettings(5L, UUID.randomUUID(), UpdateGroupSessionSettingsRequest.builder().enabled(true).build()) },
                { s, r -> s.getRecurrences(5L, UUID.randomUUID()) },
                { s, r -> s.createRecurrence(5L, UUID.randomUUID(), r) },
                { s, r -> s.updateRecurrence(5L, 77L, UUID.randomUUID(), r) },
                { s, r -> s.deleteRecurrence(5L, 77L, UUID.randomUUID()) }
        ]
    }

    def "a read by a non-member is 403 SESSION_GROUP_MEMBER_REQUIRED"() {
        given:
        def stranger = UUID.randomUUID()

        when:
        call.call(service, stranger)

        then:
        1 * groupService.isGroupMember(5L, stranger) >> false
        def e = thrown(ForbiddenException)
        e.errorCode == 'SESSION_GROUP_MEMBER_REQUIRED'
        0 * settingsRepository._
        0 * recurrenceRepository._

        where:
        call << [{ s, u -> s.getSettings(5L, u) }, { s, u -> s.getRecurrences(5L, u) }]
    }

    def "a write by a plain member is 403 SESSION_GROUP_ADMIN_REQUIRED and by a non-member SESSION_GROUP_MEMBER_REQUIRED, nothing is written"() {
        given:
        def caller = UUID.randomUUID()

        when:
        call.call(service, caller)

        then:
        1 * groupService.canManageMembers(5L, caller) >> false
        1 * groupService.isGroupMember(5L, caller) >> isMember
        def e = thrown(ForbiddenException)
        e.errorCode == code
        0 * settingsRepository.save(_)
        0 * recurrenceRepository.save(_)
        0 * recurrenceRepository.delete(_)
        0 * memberRepository.saveAll(_)
        0 * postService._

        where:
        isMember | code                             | call
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.updateSettings(5L, u, UpdateGroupSessionSettingsRequest.builder().enabled(true).build()) }
        false    | 'SESSION_GROUP_MEMBER_REQUIRED'  | { s, u -> s.updateSettings(5L, u, UpdateGroupSessionSettingsRequest.builder().enabled(true).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.createRecurrence(5L, u, GroupSessionRecurrenceRequest.builder().dayKey(1).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.updateRecurrence(5L, 77L, u, GroupSessionRecurrenceRequest.builder().dayKey(1).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.deleteRecurrence(5L, 77L, u) }
    }

    // ---- settings -------------------------------------------------------------------------------------------------

    def "a group that never saved settings is off and WEEKLY"() {
        when:
        def result = service.getSettings(5L, admin)

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        result.groupId == 5L
        !result.enabled
        result.mode == RecurrenceMode.WEEKLY
    }

    def "turning generation on saves it and writes one GROUP_SYSTEM post authored as the owner, with the actor's name and the mode"() {
        when:
        def result = service.updateSettings(5L, admin, UpdateGroupSessionSettingsRequest.builder().enabled(true).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * settingsRepository.save({ GroupSessionSettings s -> s.groupId == 5L && s.enabled && s.mode == RecurrenceMode.WEEKLY }) >> { GroupSessionSettings s -> s }
        1 * postService.createSystemPost(5L, owner, "Alice Admin turned on regular sessions (weekly)", SystemCode.GROUP_SESSION_GENERATION_ON,
                [name: "Alice Admin", mode: "WEEKLY"])
        result.enabled
    }

    def "turning generation off, and switching the mode, each write their own post; both at once write both"() {
        given:
        def existing = GroupSessionSettings.builder().groupId(5L).enabled(true).mode(RecurrenceMode.WEEKLY).build()

        when:
        def result = service.updateSettings(5L, admin, UpdateGroupSessionSettingsRequest.builder().enabled(false).mode(RecurrenceMode.MONTHLY).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(existing)
        1 * settingsRepository.save(_ as GroupSessionSettings) >> { GroupSessionSettings s -> s }
        1 * postService.createSystemPost(5L, owner, "Alice Admin turned off regular sessions (monthly)", SystemCode.GROUP_SESSION_GENERATION_OFF,
                [name: "Alice Admin", mode: "MONTHLY"])
        1 * postService.createSystemPost(5L, owner, "Alice Admin switched regular sessions to monthly", SystemCode.GROUP_SESSION_MODE_CHANGED,
                [name: "Alice Admin", mode: "MONTHLY"])
        !result.enabled
        result.mode == RecurrenceMode.MONTHLY
    }

    def "a partial update changes only the sent field"() {
        given:
        def existing = GroupSessionSettings.builder().groupId(5L).enabled(true).mode(RecurrenceMode.MONTHLY).build()

        when:
        def result = service.updateSettings(5L, admin, UpdateGroupSessionSettingsRequest.builder().enabled(false).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(existing)
        1 * settingsRepository.save({ GroupSessionSettings s -> !s.enabled && s.mode == RecurrenceMode.MONTHLY }) >> { GroupSessionSettings s -> s }
        1 * postService.createSystemPost(5L, owner, _, SystemCode.GROUP_SESSION_GENERATION_OFF, _)
        0 * postService.createSystemPost(*_)
        result.mode == RecurrenceMode.MONTHLY
    }

    def "an update that changes nothing saves nothing and writes no post (and creates no row)"() {
        when:
        service.updateSettings(5L, admin, request)

        then:
        1 * settingsRepository.findById(5L) >> existing
        0 * settingsRepository.save(_)
        0 * postService._

        where:
        request                                                                            | existing
        UpdateGroupSessionSettingsRequest.builder().enabled(false).build()                 | Optional.empty()
        UpdateGroupSessionSettingsRequest.builder().mode(RecurrenceMode.WEEKLY).build()    | Optional.empty()
        UpdateGroupSessionSettingsRequest.builder().build()                                | Optional.empty()
        UpdateGroupSessionSettingsRequest.builder().enabled(true).mode(RecurrenceMode.MONTHLY).build() |
                Optional.of(GroupSessionSettings.builder().groupId(5L).enabled(true).mode(RecurrenceMode.MONTHLY).build())
    }

    // ---- create ---------------------------------------------------------------------------------------------------

    def "a new configuration takes the group's current mode (WEEKLY when no settings exist)"() {
        when:
        def result = service.createRecurrence(5L, admin, complete().dayKey(dayKey).build())

        then:
        1 * settingsRepository.findById(5L) >> settings
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKey(5L, mode, dayKey) >> 0L
        result.mode == mode
        result.dayKey == dayKey

        where:
        settings                                                                                  | mode                   | dayKey
        Optional.empty()                                                                          | RecurrenceMode.WEEKLY  | 3
        Optional.of(GroupSessionSettings.builder().groupId(5L).mode(RecurrenceMode.MONTHLY).build()) | RecurrenceMode.MONTHLY | 31
    }

    def "dayKey must fit the mode: 1-7 weekly, 1-31 monthly"() {
        when:
        service.createRecurrence(5L, admin, complete().dayKey(dayKey).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(GroupSessionSettings.builder().groupId(5L).mode(mode).build())
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_RECURRENCE_DAY_INVALID'
        0 * recurrenceRepository.save(_)
        0 * postService._

        where:
        mode                   | dayKey
        RecurrenceMode.WEEKLY  | null
        RecurrenceMode.WEEKLY  | 0
        RecurrenceMode.WEEKLY  | 8
        RecurrenceMode.MONTHLY | 32
        RecurrenceMode.MONTHLY | 0
    }

    def "startTime is required"() {
        when:
        service.createRecurrence(5L, admin, GroupSessionRecurrenceRequest.builder().dayKey(1).durationMinutes(60).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_RECURRENCE_START_REQUIRED'
        0 * recurrenceRepository.save(_)
    }

    def "a group with no sport cannot have configurations"() {
        when:
        service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * groupService.getGroup(5L, admin) >> GroupResponse.builder().id(5L).build()
        def e = thrown(BadRequestException)
        e.errorCode == 'SESSION_SPORT_REQUIRED'
        0 * recurrenceRepository.save(_)
    }

    def "a location of another sport is refused with the existing mismatch code"() {
        when:
        service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(2L).build()
        def e = thrown(BadRequestException)
        e.errorCode == 'GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH'
        0 * recurrenceRepository.save(_)
        0 * postService._
    }

    def "a configuration is a draft exactly when its location, duration or a fixed fee's amount is missing, and says what"() {
        when:
        def result = service.createRecurrence(5L, admin, request)

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        (request.locationId != null ? 1 : 0) * locationService.getLocation(_) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.save({ GroupSessionRecurrence r -> r.draft == draft }) >> { GroupSessionRecurrence r -> r.id = 77L; r }
        result.draft == draft
        result.missing == missing

        where:
        request                                                                                                  | draft | missing
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).durationMinutes(60).locationId(9L).build() | false | []
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).durationMinutes(60).build()                | true  | ['locationId']
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).locationId(9L).build()                    | true  | ['durationMinutes']
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).build()                                   | true  | ['locationId', 'durationMinutes']
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).durationMinutes(60).locationId(9L)
                .feeType(FeeType.FIXED).build()                                                                                    | true  | ['feeAmountVnd']
        GroupSessionRecurrenceRequest.builder().dayKey(1).startTime(LocalTime.of(9, 0)).durationMinutes(60).locationId(9L)
                .feeType(FeeType.FIXED).feeAmountVnd(50000L).build()                                                               | false | []
    }

    def "fee defaults to FREE, a non-FIXED fee drops its amount, mood defaults to 5, blank notes become null"() {
        when:
        service.createRecurrence(5L, admin, complete().feeType(feeType).feeAmountVnd(1000L).locationNote("  ").feeNote("").build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.save({ GroupSessionRecurrence r ->
            r.feeType == expectedType && r.feeAmountVnd == expectedAmount && r.gameMood == 5 &&
                    r.locationNote == null && r.feeNote == null }) >> { GroupSessionRecurrence r -> r.id = 77L; r }

        where:
        feeType       | expectedType  | expectedAmount
        null          | FeeType.FREE  | null
        FeeType.SPLIT | FeeType.SPLIT | null
        FeeType.FIXED | FeeType.FIXED | 1000L
    }

    def "attributes go through the session attribute filter with the group's sport"() {
        given:
        def raw = [balls: true]

        when:
        service.createRecurrence(5L, admin, complete().attributes(raw).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * attributeResolver.resolve(raw, 1L) >> [balls: true]
        1 * recurrenceRepository.save({ GroupSessionRecurrence r -> r.attributes == [balls: true] }) >> { GroupSessionRecurrence r -> r.id = 77L; r }
    }

    def "a SPECIFIC audience stores its validated members; ALL_MEMBERS ignores audienceUserIds"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()

        when:
        def specific = service.createRecurrence(5L, admin, complete().audience(GroupAudience.SPECIFIC).audienceUserIds([a, b, a]).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * groupService.getMemberUserIds(5L) >> [admin, a, b]
        1 * memberRepository.saveAll({ List l -> l.size() == 2 && (l*.userId as Set) == ([a, b] as Set) && l.every { it.recurrenceId == 77L } })
        specific.audience == GroupAudience.SPECIFIC
        (specific.audienceUserIds as Set) == ([a, b] as Set)

        when:
        def all = service.createRecurrence(5L, admin, complete().audience(GroupAudience.ALL_MEMBERS).audienceUserIds([UUID.randomUUID()]).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        0 * groupService.getMemberUserIds(*_)
        0 * memberRepository.saveAll(_)
        all.audienceUserIds == []
    }

    def "a SPECIFIC audience with a non-member or with nobody is refused, nothing written"() {
        when:
        service.createRecurrence(5L, admin, complete().audience(GroupAudience.SPECIFIC).audienceUserIds(ids).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * groupService.getMemberUserIds(5L) >> [admin]
        def e = thrown(BadRequestException)
        e.errorCode == code
        0 * recurrenceRepository.save(_)
        0 * postService._

        where:
        ids                                | code
        [UUID.randomUUID()]                | 'SESSION_AUDIENCE_NOT_MEMBER'
        []                                 | 'SESSION_AUDIENCE_REQUIRED'
        null                               | 'SESSION_AUDIENCE_REQUIRED'
    }

    def "the sixth configuration of a day is 409 SESSION_RECURRENCE_DAY_LIMIT (drafts count)"() {
        when:
        service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKey(5L, RecurrenceMode.WEEKLY, 1) >> existing
        def e = thrown(ConflictException)
        e.errorCode == 'SESSION_RECURRENCE_DAY_LIMIT'
        e.errorParams.limit == 5
        0 * recurrenceRepository.save(_)
        0 * postService._

        where:
        existing << [5L, 9L]
    }

    def "the fifth configuration of a day is accepted"() {
        when:
        def result = service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKey(5L, RecurrenceMode.WEEKLY, 1) >> 4L
        1 * recurrenceRepository.save(_ as GroupSessionRecurrence) >> { GroupSessionRecurrence r -> r.id = 77L; r }
        result.id == 77L
    }

    def "a created configuration writes one GROUP_SYSTEM post: weekly names the weekday, monthly the ordinal"() {
        when:
        service.createRecurrence(5L, admin, complete().dayKey(dayKey).startTime(LocalTime.of(7, 5)).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(GroupSessionSettings.builder().groupId(5L).mode(mode).build())
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * postService.createSystemPost(5L, owner, text, SystemCode.GROUP_SESSION_RECURRENCE_ADDED,
                [name: "Alice Admin", mode: mode.name(), day: dayKey.toString(), time: "07:05"])

        where:
        mode                   | dayKey | text
        RecurrenceMode.WEEKLY  | 1      | "Alice Admin added a weekly session on Monday at 07:05"
        RecurrenceMode.WEEKLY  | 7      | "Alice Admin added a weekly session on Sunday at 07:05"
        RecurrenceMode.MONTHLY | 1      | "Alice Admin added a monthly session on the 1st at 07:05"
        RecurrenceMode.MONTHLY | 2      | "Alice Admin added a monthly session on the 2nd at 07:05"
        RecurrenceMode.MONTHLY | 3      | "Alice Admin added a monthly session on the 3rd at 07:05"
        RecurrenceMode.MONTHLY | 11     | "Alice Admin added a monthly session on the 11th at 07:05"
        RecurrenceMode.MONTHLY | 21     | "Alice Admin added a monthly session on the 21st at 07:05"
        RecurrenceMode.MONTHLY | 31     | "Alice Admin added a monthly session on the 31st at 07:05"
    }

    // ---- update, delete, list --------------------------------------------------------------------------------------

    def "updating replaces the fields and the chosen members (delete, flush, then insert), keeps the mode and writes an UPDATED post"() {
        given:
        def existing = stored(mode: RecurrenceMode.MONTHLY, dayKey: 10)
        def a = UUID.randomUUID()

        when:
        def result = service.updateRecurrence(5L, 77L, admin,
                complete().dayKey(12).audience(GroupAudience.SPECIFIC).audienceUserIds([a]).durationMinutes(45).build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(existing)
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * groupService.getMemberUserIds(5L) >> [admin, a]
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(5L, RecurrenceMode.MONTHLY, 12, 77L) >> 0L
        1 * recurrenceRepository.save({ GroupSessionRecurrence r -> r.mode == RecurrenceMode.MONTHLY && r.dayKey == 12 && r.durationMinutes == 45 }) >> { GroupSessionRecurrence r -> r }

        then: "the old members are removed and flushed before the new ones are inserted"
        1 * memberRepository.deleteByRecurrenceId(77L)

        then:
        1 * memberRepository.flush()

        then:
        1 * memberRepository.saveAll({ List l -> l*.userId == [a] })
        1 * postService.createSystemPost(5L, owner, "Alice Admin changed the monthly session on the 12th at 18:30",
                SystemCode.GROUP_SESSION_RECURRENCE_UPDATED, [name: "Alice Admin", mode: "MONTHLY", day: "12", time: "18:30"])
        result.mode == RecurrenceMode.MONTHLY
        result.dayKey == 12
    }

    def "updating counts the other configurations of the target day, never itself, against the limit"() {
        when:
        service.updateRecurrence(5L, 77L, admin, complete().dayKey(2).build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(5L, RecurrenceMode.WEEKLY, 2, 77L) >> 5L
        def e = thrown(ConflictException)
        e.errorCode == 'SESSION_RECURRENCE_DAY_LIMIT'
        0 * recurrenceRepository.save(_)
        0 * memberRepository.deleteByRecurrenceId(_)
        0 * postService._
    }

    def "updating or deleting a configuration that is not this group's is 404 SESSION_RECURRENCE_NOT_FOUND"() {
        when:
        call.call(service, admin, complete().build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.empty()
        def e = thrown(ResourceNotFoundException)
        e.errorCode == 'SESSION_RECURRENCE_NOT_FOUND'
        0 * recurrenceRepository.save(_)
        0 * recurrenceRepository.delete(_)
        0 * postService._

        where:
        call << [{ s, u, r -> s.updateRecurrence(5L, 77L, u, r) }, { s, u, r -> s.deleteRecurrence(5L, 77L, u) }]
    }

    def "deleting removes the members and the configuration (hard delete) and writes a DELETED post"() {
        given:
        def existing = stored(dayKey: 3)

        when:
        service.deleteRecurrence(5L, 77L, admin)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(existing)
        1 * memberRepository.deleteByRecurrenceId(77L)
        1 * recurrenceRepository.delete(existing)
        1 * postService.createSystemPost(5L, owner, "Alice Admin removed the weekly session on Wednesday at 18:30",
                SystemCode.GROUP_SESSION_RECURRENCE_DELETED, [name: "Alice Admin", mode: "WEEKLY", day: "3", time: "18:30"])
    }

    def "the list asks for every chosen member of every configuration in one query, and none when there is nothing"() {
        given:
        def a = UUID.randomUUID()
        def r1 = stored(dayKey: 1)
        def r2 = stored(dayKey: 2)
        r2.id = 78L
        r2.audience = GroupAudience.SPECIFIC

        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [r1, r2]
        1 * memberRepository.findByRecurrenceIdIn([77L, 78L]) >> [GroupSessionRecurrenceMember.builder().recurrenceId(78L).userId(a).build()]
        0 * memberRepository.findByRecurrenceId(_)
        result*.id == [77L, 78L]
        result[0].audienceUserIds == []
        result[1].audienceUserIds == [a]

        when:
        def empty = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> []
        0 * memberRepository._
        empty == []
    }
}

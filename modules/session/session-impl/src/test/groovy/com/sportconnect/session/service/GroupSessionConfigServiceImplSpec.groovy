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
import com.sportconnect.session.entity.GroupSessionSettings
import com.sportconnect.session.entity.Session
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.session.api.dto.RegularSessionScope
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository
import com.sportconnect.session.repository.GroupSessionSettingsRepository
import com.sportconnect.social.post.api.dto.SystemCode
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.user.api.dto.UserSummaryResponse
import com.sportconnect.user.api.service.UserService
import org.springframework.context.ApplicationEventPublisher
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
    GroupService groupService = Mock()
    LocationService locationService = Mock()
    PostService postService = Mock()
    UserService userService = Mock()
    SessionAttributeResolver attributeResolver = Mock()
    ApplicationEventPublisher eventPublisher = Mock()
    RegularSessionCanceller regularSessionCanceller = Mock()
    SessionRepository sessionRepository = Mock()
    UUID other = UUID.randomUUID()

    @Subject
    GroupSessionConfigServiceImpl service = new GroupSessionConfigServiceImpl(
            settingsRepository, recurrenceRepository, groupService, locationService, postService,
            userService, attributeResolver, eventPublisher,
            regularSessionCanceller, sessionRepository)

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
                { s, r -> s.deleteRecurrence(5L, 77L, UUID.randomUUID(), false) }
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
        0 * postService._

        where:
        isMember | code                             | call
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.updateSettings(5L, u, UpdateGroupSessionSettingsRequest.builder().enabled(true).build()) }
        false    | 'SESSION_GROUP_MEMBER_REQUIRED'  | { s, u -> s.updateSettings(5L, u, UpdateGroupSessionSettingsRequest.builder().enabled(true).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.createRecurrence(5L, u, GroupSessionRecurrenceRequest.builder().dayKey(1).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.updateRecurrence(5L, 77L, u, GroupSessionRecurrenceRequest.builder().dayKey(1).build()) }
        true     | 'SESSION_GROUP_ADMIN_REQUIRED'   | { s, u -> s.deleteRecurrence(5L, 77L, u, false) }
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
        // The chosen members go on the recurrence itself: distinct, in the order given.
        1 * recurrenceRepository.save({ GroupSessionRecurrence r -> r.audienceUserIds == [a, b] }) >> { GroupSessionRecurrence r -> r.id = 77L; r }
        // ...and the response names them (CLIENT-GROUP-SESSION-5): one display lookup, in the order they were picked.
        1 * userService.getUserSummariesByIds([a, b]) >> [(a): UserSummaryResponse.builder().id(a).fullName("Ann").avatarUrl("https://img/ann.png").build(), (b): UserSummaryResponse.builder().id(b).fullName("Bob").avatarUrl("https://img/bob.png").build()]
        specific.audience == GroupAudience.SPECIFIC
        specific.audienceMembers*.id == [a, b]
        specific.audienceMembers*.name == ["Ann", "Bob"]
        specific.audienceMembers*.avatarUrl == ["https://img/ann.png", "https://img/bob.png"]

        when:
        def all = service.createRecurrence(5L, admin, complete().audience(GroupAudience.ALL_MEMBERS).audienceUserIds([UUID.randomUUID()]).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        0 * groupService.getMemberUserIds(*_)
        1 * recurrenceRepository.save({ GroupSessionRecurrence r -> r.audienceUserIds == null }) >> { GroupSessionRecurrence r -> r.id = 77L; r }
        all.audienceMembers == []
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

    def "updating replaces the fields and the chosen members, keeps the mode and writes an UPDATED post"() {
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
        1 * recurrenceRepository.save({ GroupSessionRecurrence r ->
            r.mode == RecurrenceMode.MONTHLY && r.dayKey == 12 && r.durationMinutes == 45 && r.audienceUserIds == [a] }) >> { GroupSessionRecurrence r -> r }
        1 * postService.createSystemPost(5L, owner, "Alice Admin changed the monthly session on the 12th at 18:30",
                SystemCode.GROUP_SESSION_RECURRENCE_UPDATED, [name: "Alice Admin", mode: "MONTHLY", day: "12", time: "18:30"])
        result.mode == RecurrenceMode.MONTHLY
        result.dayKey == 12
        1 * userService.getUserSummariesByIds([a]) >> [(a): UserSummaryResponse.builder().id(a).fullName("Ann").avatarUrl("https://img/ann.png").build()]
        result.audienceMembers*.id == [a]
        result.audienceMembers*.name == ["Ann"]
    }

    def "updating from SPECIFIC to ALL_MEMBERS clears the chosen members; a new list replaces the old one whole"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()
        def existing = stored(dayKey: 4)
        existing.audience = GroupAudience.SPECIFIC
        existing.audienceUserIds = [a, b]

        when: "replaced by a different list"
        def replaced = service.updateRecurrence(5L, 77L, admin, complete().dayKey(4).audience(GroupAudience.SPECIFIC).audienceUserIds([b]).build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(existing)
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * groupService.getMemberUserIds(5L) >> [admin, a, b]
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(5L, RecurrenceMode.WEEKLY, 4, 77L) >> 0L
        1 * userService.getUserSummariesByIds([b]) >> [(b): UserSummaryResponse.builder().id(b).fullName("Bob").avatarUrl("https://img/bob.png").build()]
        replaced.audienceMembers*.id == [b]
        existing.audienceUserIds == [b]

        when: "switched to all members, with a stale list in the request"
        def all = service.updateRecurrence(5L, 77L, admin, complete().dayKey(4).audience(GroupAudience.ALL_MEMBERS).audienceUserIds([a]).build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(existing)
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        0 * groupService.getMemberUserIds(*_)
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(5L, RecurrenceMode.WEEKLY, 4, 77L) >> 0L
        all.audience == GroupAudience.ALL_MEMBERS
        all.audienceMembers == []
        existing.audienceUserIds == null
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
        call << [{ s, u, r -> s.updateRecurrence(5L, 77L, u, r) }, { s, u, r -> s.deleteRecurrence(5L, 77L, u, false) }]
    }

    def "deleting removes the configuration, members and all (hard delete), and writes a DELETED post"() {
        given:
        def existing = stored(dayKey: 3)

        when:
        service.deleteRecurrence(5L, 77L, admin, false)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(existing)
        1 * recurrenceRepository.delete(existing)
        1 * postService.createSystemPost(5L, owner, "Alice Admin removed the weekly session on Wednesday at 18:30",
                SystemCode.GROUP_SESSION_RECURRENCE_DELETED, [name: "Alice Admin", mode: "WEEKLY", day: "3", time: "18:30"])
    }

    def "the list names each configuration's chosen members with ONE lookup for all of them, and nothing when there is nothing"() {
        given:
        def a = UUID.randomUUID()
        def r1 = stored(dayKey: 1)
        def r2 = stored(dayKey: 2)
        r2.id = 78L
        r2.audience = GroupAudience.SPECIFIC
        r2.audienceUserIds = [a]

        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [r1, r2]
        1 * locationService.getLocationsByIds([9L]) >> [(9L): LocationResponse.builder().id(9L).sportId(1L).build()]
        1 * userService.getUserSummariesByIds([a]) >> [(a): UserSummaryResponse.builder().id(a).fullName("Ann").avatarUrl("https://img/ann.png").build()]
        result*.id == [77L, 78L]
        result[0].audienceMembers == []
        result[1].audienceMembers*.id == [a]
        result[1].audienceMembers*.name == ["Ann"]

        when:
        def empty = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> []
        empty == []
    }

    def "the list looks the audiences up once for every row: shared members asked once, an unresolved id is left out, the picked order is kept"() {
        given:
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()
        def gone = UUID.randomUUID()
        def r1 = stored(dayKey: 1)
        r1.audience = GroupAudience.SPECIFIC
        r1.audienceUserIds = [b, a]
        def r2 = stored(dayKey: 2)
        r2.id = 78L
        r2.audience = GroupAudience.SPECIFIC
        r2.audienceUserIds = [a, gone]
        def r3 = stored(dayKey: 3)                                     // everyone: nothing to name
        r3.id = 79L

        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [r1, r2, r3]
        1 * locationService.getLocationsByIds([9L]) >> [(9L): LocationResponse.builder().id(9L).sportId(1L).build()]
        1 * userService.getUserSummariesByIds({ List ids -> ids.size() == 3 && ids as Set == [a, b, gone] as Set }) >> [(a): UserSummaryResponse.builder().id(a).fullName("Ann").avatarUrl("https://img/ann.png").build(), (b): UserSummaryResponse.builder().id(b).fullName("Bob").avatarUrl("https://img/bob.png").build()]
        0 * userService.getUserSummariesByIds(_)
        result[0].audienceMembers*.name == ["Bob", "Ann"]
        result[1].audienceMembers*.name == ["Ann"]
        result[2].audienceMembers == []
    }

    def "the list makes no member lookup when nobody has a chosen audience"() {
        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [stored(dayKey: 1)]
        1 * locationService.getLocationsByIds([9L]) >> [(9L): LocationResponse.builder().id(9L).sportId(1L).build()]
        0 * userService.getUserSummariesByIds(_)
        result[0].audienceMembers == []
    }

    // ---- CLIENT-GROUP-SESSION-4: the resolved location on every configuration ------------------------------------------

    def "the list resolves the distinct locations of all configurations in ONE batch lookup and puts each on its own row"() {
        given:
        def r1 = stored(dayKey: 1)                                     // location 9
        def r2 = stored(dayKey: 2)
        r2.id = 78L
        r2.locationId = 10L
        def r3 = stored(dayKey: 3)                                     // location 9 again: asked once
        r3.id = 79L
        def r4 = stored(dayKey: 4)                                     // no location at all
        r4.id = 80L
        r4.locationId = null
        def court = LocationResponse.builder().id(9L).name("Court 9").sportId(1L).build()
        def hall = LocationResponse.builder().id(10L).name("Hall 10").sportId(1L).build()

        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [r1, r2, r3, r4]
        1 * locationService.getLocationsByIds([9L, 10L]) >> [(9L): court, (10L): hall]
        0 * locationService.getLocation(_)
        result*.location == [court, hall, court, null]
        result*.locationId == [9L, 10L, 9L, null]
    }

    def "a location that is no longer available comes back null while its id stays; no lookup at all when no configuration has a location"() {
        given:
        def gone = stored(dayKey: 1)
        def none = stored(dayKey: 2)
        none.id = 78L
        none.locationId = null

        when:
        def result = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [gone, none]
        1 * locationService.getLocationsByIds([9L]) >> [:]
        result[0].location == null
        result[0].locationId == 9L

        when:
        def noLocations = service.getRecurrences(5L, admin)

        then:
        1 * recurrenceRepository.findByGroupIdOrderByModeAscDayKeyAscStartTimeAsc(5L) >> [none]
        0 * locationService.getLocationsByIds(_)
        0 * locationService.getLocation(_)
        noLocations[0].location == null
    }

    def "creating and updating answer with the location they already fetched for the sport check (no second lookup); without one the location is null"() {
        given:
        def court = LocationResponse.builder().id(9L).name("Court 9").sportId(1L).build()

        when:
        def created = service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> court
        0 * locationService.getLocationsByIds(_)
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKey(5L, RecurrenceMode.WEEKLY, 1) >> 0L
        created.location == court
        created.locationId == 9L

        when:
        def updated = service.updateRecurrence(5L, 77L, admin, complete().build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        1 * locationService.getLocation(9L) >> court
        0 * locationService.getLocationsByIds(_)
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKeyAndIdNot(5L, RecurrenceMode.WEEKLY, 1, 77L) >> 0L
        updated.location == court

        when:
        def draft = service.createRecurrence(5L, admin, complete().locationId(null).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        0 * locationService.getLocation(_)
        0 * locationService.getLocationsByIds(_)
        1 * recurrenceRepository.countByGroupIdAndModeAndDayKey(5L, RecurrenceMode.WEEKLY, 1) >> 0L
        draft.location == null
        draft.locationId == null
    }

    // ---- SESSION-GROUP-5: asking the generator to look at the group ----------------------------------------------------

    def "switching generation ON, or the mode while it is on, publishes ConfigChanged; OFF, a no-op and a mode switch while off do not"() {
        when:
        service.updateSettings(5L, admin, request)

        then:
        1 * settingsRepository.findById(5L) >> existing
        _ * settingsRepository.save(_ as GroupSessionSettings) >> { GroupSessionSettings s -> s }
        (publishes ? 1 : 0) * eventPublisher.publishEvent({ e -> e instanceof GroupSessionGenerationEvents.ConfigChanged && e.groupId() == 5L })

        where:
        request                                                                   | existing                                                                                   | publishes
        UpdateGroupSessionSettingsRequest.builder().enabled(true).build()         | Optional.empty()                                                                           | true
        UpdateGroupSessionSettingsRequest.builder().mode(RecurrenceMode.MONTHLY).build() | Optional.of(GroupSessionSettings.builder().groupId(5L).enabled(true).build())       | true
        UpdateGroupSessionSettingsRequest.builder().enabled(false).build()        | Optional.of(GroupSessionSettings.builder().groupId(5L).enabled(true).build())             | false
        UpdateGroupSessionSettingsRequest.builder().mode(RecurrenceMode.MONTHLY).build() | Optional.of(GroupSessionSettings.builder().groupId(5L).enabled(false).build())      | false
        UpdateGroupSessionSettingsRequest.builder().enabled(true).build()         | Optional.of(GroupSessionSettings.builder().groupId(5L).enabled(true).build())             | false
    }

    def "adding or replacing a configuration publishes ConfigChanged; deleting one does not"() {
        when:
        service.createRecurrence(5L, admin, complete().build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.empty()
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * eventPublisher.publishEvent({ e -> e instanceof GroupSessionGenerationEvents.ConfigChanged && e.groupId() == 5L })

        when:
        service.updateRecurrence(5L, 77L, admin, complete().build())

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        1 * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).sportId(1L).build()
        1 * eventPublisher.publishEvent({ e -> e instanceof GroupSessionGenerationEvents.ConfigChanged })

        when:
        service.deleteRecurrence(5L, 77L, admin, false)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        0 * eventPublisher.publishEvent(_)
    }

    // ---- SESSION-GROUP-6: cancelling what the old rule left scheduled ------------------------------------------------------

    def "turning generation off with cancelScheduled cancels the group's scheduled regular sessions, tells the cancel by name, and says how many"() {
        given:
        def scheduled = [Session.builder().id(1L).groupId(5L).recurrenceId(7L).status(SessionStatus.SCHEDULED).build()]
        def existing = GroupSessionSettings.builder().groupId(5L).enabled(true).mode(RecurrenceMode.WEEKLY).build()

        when:
        def result = service.updateSettings(5L, admin, UpdateGroupSessionSettingsRequest.builder().enabled(false).cancelScheduled(true).build())

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(existing)
        _ * settingsRepository.save(_ as GroupSessionSettings) >> { GroupSessionSettings s -> s }
        1 * sessionRepository.findByGroupIdAndRecurrenceIdIsNotNullAndStatusIn(5L, [SessionStatus.SCHEDULED, SessionStatus.PREPARING]) >> scheduled
        1 * regularSessionCanceller.cancel(scheduled, admin, "Cancelled because the group turned off regular sessions") >> 1
        result.cancelledSessions == 1
        !result.enabled
    }

    def "switching the mode with cancelScheduled cancels them too, with the mode in the reason; OFF wins when both change"() {
        given:
        def existing = GroupSessionSettings.builder().groupId(5L).enabled(true).mode(RecurrenceMode.WEEKLY).build()

        when:
        def result = service.updateSettings(5L, admin, request)

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(existing)
        _ * settingsRepository.save(_ as GroupSessionSettings) >> { GroupSessionSettings s -> s }
        1 * sessionRepository.findByGroupIdAndRecurrenceIdIsNotNullAndStatusIn(5L, _) >> []
        1 * regularSessionCanceller.cancel(_, admin, reason) >> 2
        result.cancelledSessions == 2

        where:
        request                                                                                                              | reason
        UpdateGroupSessionSettingsRequest.builder().mode(RecurrenceMode.MONTHLY).cancelScheduled(true).build()               | "Cancelled because the group switched its regular sessions to monthly"
        UpdateGroupSessionSettingsRequest.builder().enabled(false).mode(RecurrenceMode.MONTHLY).cancelScheduled(true).build() | "Cancelled because the group turned off regular sessions"
    }

    def "nothing is cancelled unless asked, or when the call neither turns generation off nor switches the mode"() {
        given:
        def existing = GroupSessionSettings.builder().groupId(5L).enabled(on).mode(RecurrenceMode.WEEKLY).build()

        when:
        def result = service.updateSettings(5L, admin, request)

        then:
        1 * settingsRepository.findById(5L) >> Optional.of(existing)
        _ * settingsRepository.save(_ as GroupSessionSettings) >> { GroupSessionSettings s -> s }
        0 * regularSessionCanceller._
        0 * sessionRepository._
        result.cancelledSessions == 0

        where:
        on    | request
        true  | UpdateGroupSessionSettingsRequest.builder().enabled(false).build()                                  // "leave them there"
        true  | UpdateGroupSessionSettingsRequest.builder().enabled(false).cancelScheduled(false).build()
        false | UpdateGroupSessionSettingsRequest.builder().enabled(true).cancelScheduled(true).build()             // turning ON
        true  | UpdateGroupSessionSettingsRequest.builder().enabled(true).cancelScheduled(true).build()             // no change
    }

    def "deleting a configuration with cancelScheduled cancels what it generated first, then deletes it; without it nothing is cancelled"() {
        given:
        def scheduled = [Session.builder().id(1L).groupId(5L).recurrenceId(77L).status(SessionStatus.SCHEDULED).build()]

        when:
        def cancelled = service.deleteRecurrence(5L, 77L, admin, true)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        1 * sessionRepository.findByRecurrenceIdAndStatusIn(77L, [SessionStatus.SCHEDULED, SessionStatus.PREPARING]) >> scheduled
        1 * regularSessionCanceller.cancel(scheduled, admin, "Cancelled because the group removed this regular session configuration") >> 1
        then:
        1 * recurrenceRepository.delete(_ as GroupSessionRecurrence)
        cancelled == 1

        when:
        def none = service.deleteRecurrence(5L, 77L, admin, false)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        0 * regularSessionCanceller._
        0 * sessionRepository._
        1 * recurrenceRepository.delete(_ as GroupSessionRecurrence)
        none == 0
    }

    def "the count is per group (ALL) or per configuration (RECURRENCE), counts only SCHEDULED and PREPARING, and needs a manager"() {
        when:
        def all = service.countScheduledRegularSessions(5L, admin, RegularSessionScope.ALL, null)

        then:
        1 * sessionRepository.countByGroupIdAndRecurrenceIdIsNotNullAndStatusIn(5L, [SessionStatus.SCHEDULED, SessionStatus.PREPARING]) >> 3L
        all.count == 3

        when:
        def one = service.countScheduledRegularSessions(5L, admin, RegularSessionScope.RECURRENCE, 77L)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(77L, 5L) >> Optional.of(stored())
        1 * sessionRepository.countByRecurrenceIdAndStatusIn(77L, [SessionStatus.SCHEDULED, SessionStatus.PREPARING]) >> 1L
        one.count == 1

        when: "a configuration of another group is not found"
        service.countScheduledRegularSessions(5L, admin, RegularSessionScope.RECURRENCE, 99L)

        then:
        1 * recurrenceRepository.findByIdAndGroupId(99L, 5L) >> Optional.empty()
        def e = thrown(ResourceNotFoundException)
        e.errorCode == 'SESSION_RECURRENCE_NOT_FOUND'

        when: "RECURRENCE needs its id"
        service.countScheduledRegularSessions(5L, admin, RegularSessionScope.RECURRENCE, null)

        then:
        thrown(BadRequestException)
        0 * sessionRepository._
    }

    def "counting is for owners and admins: a plain member is 403, an inactive group 404"() {
        when:
        service.countScheduledRegularSessions(5L, other, RegularSessionScope.ALL, null)

        then:
        1 * groupService.canManageMembers(5L, other) >> false
        1 * groupService.isGroupMember(5L, other) >> true
        def e = thrown(ForbiddenException)
        e.errorCode == 'SESSION_GROUP_ADMIN_REQUIRED'
        0 * sessionRepository._
    }
}

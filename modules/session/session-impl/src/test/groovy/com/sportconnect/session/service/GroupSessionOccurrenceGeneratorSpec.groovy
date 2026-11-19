package com.sportconnect.session.service

import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.api.dto.GroupAudience
import com.sportconnect.session.api.dto.RecurrenceMode
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.event.SessionGroupCreatedEvent
import com.sportconnect.session.entity.GroupSessionGenerationItem
import com.sportconnect.session.entity.GroupSessionRecurrence
import com.sportconnect.session.entity.GroupSessionSettings
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository
import com.sportconnect.session.repository.GroupSessionSettingsRepository
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

/**
 * SESSION-GROUP-5: generating one queued slot, and counting a failure. Fixed clock: Wednesday 2026-11-18 10:00 UTC; the
 * location is in UTC.
 */
class GroupSessionOccurrenceGeneratorSpec extends Specification {

    static final Instant NOW = Instant.parse("2026-11-18T10:00:00Z")
    static final LocalDate TODAY = LocalDate.of(2026, 11, 18)

    GroupSessionGenerationQueueRepository queueRepository = Mock()
    GroupSessionRecurrenceRepository recurrenceRepository = Mock()
    GroupSessionSettingsRepository settingsRepository = Mock()
    SessionRepository sessionRepository = Mock()
    SessionOutboxEventRepository outboxRepository = Mock()
    SessionOutboxWriter outboxWriter = Mock()
    GroupService groupService = Mock()
    LocationService locationService = Mock()
    PostService postService = Mock()
    UserService userService = Mock()
    GroupSessionRecipients recipients = Mock()

    @Subject
    GroupSessionOccurrenceGenerator generator = new GroupSessionOccurrenceGenerator(
            queueRepository, recurrenceRepository, settingsRepository, sessionRepository,
            outboxRepository, outboxWriter, groupService, locationService, postService, userService, recipients)

    UUID owner = UUID.randomUUID()

    // What the stubs below read: a feature changes these instead of re-stubbing (the first declared interaction wins in Spock).
    GroupSessionGenerationItem queued
    Optional<GroupSessionRecurrence> recurrenceOpt
    Optional<GroupSessionSettings> settingsOpt
    boolean groupActive = true
    boolean slotExists = false
    Session built

    def setup() {
        generator.clock = Clock.fixed(NOW, ZoneOffset.UTC)
        // The happy path by default; each case overrides what it is about.
        queued = item()
        recurrenceOpt = Optional.of(recurrence())
        settingsOpt = Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.WEEKLY).build())
        queueRepository.findByIdForUpdateSkipLocked(1L) >> { Optional.of(queued) }
        recurrenceRepository.findById(5L) >> { recurrenceOpt }
        settingsRepository.findById(10L) >> { settingsOpt }
        groupService.isGroupActive(10L) >> { groupActive }
        locationService.getLocation(9L) >> LocationResponse.builder().id(9L).timezone("UTC").build()
        sessionRepository.existsByRecurrenceIdAndOccurrenceDate(5L, TODAY) >> { slotExists }
        groupService.getGroupOwnerId(10L) >> owner
        groupService.getGroup(10L, owner) >> GroupResponse.builder().id(10L).sportId(3L).groupName("Sunday Smash").build()
        userService.findPreferredLanguageCodes(_) >> [(owner): "en"]
        postService.createSessionPost(owner, _) >> 900L
        sessionRepository.save(_ as Session) >> { Session s -> s.id = 55L; s }
        recipients.of(_, _, _) >> []
    }

    private static GroupSessionGenerationItem item(Map args = [:]) {
        GroupSessionGenerationItem.builder().id(1L).recurrenceId(5L).occurrenceDate(args.date ?: TODAY).targetStart(NOW)
                .status(args.status ?: GroupSessionGenerationItem.Status.PENDING).attempts(args.attempts ?: 0).nextAttemptAt(NOW).build()
    }

    private static GroupSessionRecurrence recurrence(Map args = [:]) {
        GroupSessionRecurrence.builder().id(5L).groupId(10L).mode(args.mode ?: RecurrenceMode.WEEKLY).dayKey(args.dayKey ?: 3)
                .startTime(LocalTime.parse(args.start ?: "18:00")).durationMinutes(args.minutes ?: 90).locationId(9L)
                .locationNote("Court 3").audience(args.audience ?: GroupAudience.ALL_MEMBERS).audienceUserIds(args.audienceUserIds).feeType(FeeType.FIXED)
                .feeAmountVnd(50000L).feeNote("per head").gameMood(7).attributes([balls: true]).draft(args.draft ?: false).build()
    }

    // ---- generating ------------------------------------------------------------------------------------------------

    def "a future slot becomes a SCHEDULED session of the owner, copied from the recurrence, and the queue row is DONE"() {
        when:
        generator.generate(1L)

        then:
        1 * postService.createSessionPost(owner, "Session: Sunday Smash's session") >> 900L
        1 * sessionRepository.save(_ as Session) >> { Session s -> built = s; s.id = 55L; s }
        queued.status == GroupSessionGenerationItem.Status.DONE
        1 * queueRepository.save(queued)
        built.groupId == 10L
        built.isPublic == false
        built.postId == 900L
        built.sessionType == SessionType.GROUP_RECURRING
        built.createdBy == owner
        built.sportId == 3L
        built.title == "Sunday Smash's session"
        built.locationId == 9L
        built.locationNote == "Court 3"
        built.scheduledStart == Instant.parse("2026-11-18T18:00:00Z")
        built.scheduledEndAt == Instant.parse("2026-11-18T19:30:00Z")
        built.status == SessionStatus.SCHEDULED
        built.feeType == FeeType.FIXED
        built.feeAmountVnd == 50000L
        built.feeNote == "per head"
        built.autoApprove == true
        built.gameMood == 7
        built.attributes == [balls: true]
        built.groupAudience == GroupAudience.ALL_MEMBERS
        built.recurrenceId == 5L
        built.occurrenceDate == TODAY
    }

    def "a slot already under way becomes ONGOING, one that has ended is IGNORED as OUTDATED (no session)"() {
        given:
        recurrenceOpt = Optional.of(recurrence(start: start, minutes: minutes))

        when:
        generator.generate(1L)

        then:
        (created ? 1 : 0) * sessionRepository.save(_ as Session) >> { Session s -> built = s; s.id = 55L; s }
        queued.status == (created ? GroupSessionGenerationItem.Status.DONE : GroupSessionGenerationItem.Status.IGNORED)
        queued.ignoredReason == (created ? null : GroupSessionGenerationItem.IgnoredReason.OUTDATED)
        built?.status == status

        where:
        start   | minutes | created | status
        "09:00" | 180     | true    | SessionStatus.ONGOING    // 09:00-12:00, now is 10:00
        "08:00" | 90      | false   | null                     // ended 09:30
        "10:00" | 60      | true    | SessionStatus.ONGOING    // starts exactly now
        "08:30" | 90      | false   | null                     // ends exactly 10:00: ended
    }

    def "nothing is created when the recurrence is gone, a draft, incomplete, or generation does not apply: the row is IGNORED with the reason, or DONE when the session already exists"() {
        given:
        recurrenceOpt = recurrenceResult
        settingsOpt = settingsResult
        groupActive = active
        slotExists = exists

        when:
        generator.generate(1L)

        then:
        0 * sessionRepository.save(_)
        0 * postService.createSessionPost(*_)
        0 * outboxRepository.saveAll(_)
        queued.status == (reason == null ? GroupSessionGenerationItem.Status.DONE : GroupSessionGenerationItem.Status.IGNORED)
        queued.ignoredReason == reason

        where:
        recurrenceResult                                       | settingsResult                                                                                        | active | exists | reason
        Optional.empty()                                       | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.WEEKLY).build()) | true   | false | GroupSessionGenerationItem.IgnoredReason.RECURRENCE_INACTIVE
        Optional.of(recurrence(draft: true))                   | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.WEEKLY).build()) | true   | false | GroupSessionGenerationItem.IgnoredReason.RECURRENCE_INACTIVE
        Optional.of(recurrence())                              | Optional.empty()                                                                                      | true   | false | GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF
        Optional.of(recurrence())                              | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(false).mode(RecurrenceMode.WEEKLY).build()) | true   | false | GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF
        Optional.of(recurrence())                              | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.MONTHLY).build()) | true   | false | GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF
        Optional.of(recurrence())                              | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.WEEKLY).build()) | false  | false | GroupSessionGenerationItem.IgnoredReason.GROUP_INACTIVE
        Optional.of(recurrence())                              | Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(RecurrenceMode.WEEKLY).build()) | true   | true | null
    }

    def "a queued date that no longer falls on the recurrence's day is IGNORED as SUPERSEDED, before anything is built; one that does is generated"() {
        given:
        queued = item(date: date)
        recurrenceOpt = Optional.of(recurrence(mode: mode, dayKey: dayKey))
        settingsOpt = Optional.of(GroupSessionSettings.builder().groupId(10L).enabled(true).mode(mode).build())

        when:
        generator.generate(1L)

        then:
        (onRule ? 1 : 0) * locationService.getLocation(9L) >> LocationResponse.builder().id(9L).timezone("UTC").build()
        (onRule ? 1 : 0) * sessionRepository.save(_ as Session) >> { Session s -> s.id = 55L; s }
        (onRule ? 1 : 0) * postService.createSessionPost(*_) >> 900L   // nothing is built for a stale date, not even the post
        queued.status == (onRule ? GroupSessionGenerationItem.Status.DONE : GroupSessionGenerationItem.Status.IGNORED)
        queued.ignoredReason == (onRule ? null : GroupSessionGenerationItem.IgnoredReason.SUPERSEDED)

        where:
        date                     | mode                   | dayKey | onRule
        LocalDate.of(2026, 11, 18) | RecurrenceMode.WEEKLY  | 3      | true      // a Wednesday, the rule is Wednesday
        LocalDate.of(2026, 11, 18) | RecurrenceMode.WEEKLY  | 4      | false     // the owner moved it to Thursday
        LocalDate.of(2026, 11, 19) | RecurrenceMode.WEEKLY  | 3      | false     // queued for the day after
        LocalDate.of(2026, 11, 18) | RecurrenceMode.MONTHLY | 18     | true      // the 18th
        LocalDate.of(2026, 11, 18) | RecurrenceMode.MONTHLY | 19     | false     // the owner moved it to the 19th
    }

    def "a missing, locked (another runner holds it) or already handled queue row is a no-op"() {
        when:
        generator.generate(2L)
        generator.generate(3L)

        then:
        1 * queueRepository.findByIdForUpdateSkipLocked(2L) >> Optional.empty()
        1 * queueRepository.findByIdForUpdateSkipLocked(3L) >> Optional.of(item(status: GroupSessionGenerationItem.Status.DONE))
        0 * recurrenceRepository._
        0 * sessionRepository.save(_)
        0 * queueRepository.save(_)
    }

    def "a SPECIFIC audience is snapshotted onto the session, and the audience is told with session.group.created by the owner"() {
        given:
        def told = []
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()
        recurrenceOpt = Optional.of(recurrence(audience: GroupAudience.SPECIFIC, audienceUserIds: [a, b]))

        when:
        generator.generate(1L)

        then:
        // Snapshotted onto the session itself, distinct.
        1 * sessionRepository.save(_ as Session) >> { Session s -> built = s; s.id = 55L; s }
        1 * recipients.of({ Session s -> s.id == 55L && s.groupAudience == GroupAudience.SPECIFIC }, owner, false) >> [a]
        1 * outboxWriter.build("session.group.created", _) >> { String type, Object payload -> told << payload; new SessionOutboxEvent() }
        1 * outboxRepository.saveAll({ List l -> l.size() == 1 })
        told.size() == 1
        told[0] instanceof SessionGroupCreatedEvent
        told[0].sessionId == 55L
        told[0].actorId == owner
        told[0].recipientUserId == a
        told[0].groupId == 10L
        built.groupAudienceUserIds == [a, b]
    }

    def "an ALL_MEMBERS slot stores no chosen members, even if the recurrence still carries a list; nobody to tell writes no events"() {
        given:
        recurrenceOpt = Optional.of(recurrence(audienceUserIds: [UUID.randomUUID()]))

        when:
        generator.generate(1L)

        then:
        1 * sessionRepository.save(_ as Session) >> { Session s -> built = s; s.id = 55L; s }
        1 * recipients.of(_, owner, false) >> []
        0 * outboxRepository.saveAll(_)
        built.groupAudienceUserIds == null
    }

    def "a failure while generating propagates (the caller records it) and leaves the row PENDING"() {
        when:
        generator.generate(1L)

        then:
        1 * groupService.getGroupOwnerId(10L) >> { throw new RuntimeException("no owner row") }
        thrown(RuntimeException)
        queued.status == GroupSessionGenerationItem.Status.PENDING
        0 * sessionRepository.save(_)
        0 * queueRepository.save(_)
    }

    // ---- failures --------------------------------------------------------------------------------------------------

    def "a failed attempt backs off 1, 5, 15 and 60 minutes, and the fifth makes the row FAILED"() {
        given:
        queued = item(attempts: before)

        when:
        generator.recordFailure(1L, "boom")

        then:
        queued.attempts == before + 1
        queued.lastError == "boom"
        queued.lastAttemptAt == NOW
        queued.status == status
        (status == GroupSessionGenerationItem.Status.PENDING ? queued.nextAttemptAt : NOW) == (minutes ? NOW.plusSeconds(minutes * 60L) : NOW)
        1 * queueRepository.save(queued)

        where:
        before | status                                    | minutes
        0      | GroupSessionGenerationItem.Status.PENDING | 1
        1      | GroupSessionGenerationItem.Status.PENDING | 5
        2      | GroupSessionGenerationItem.Status.PENDING | 15
        3      | GroupSessionGenerationItem.Status.PENDING | 60
        4      | GroupSessionGenerationItem.Status.FAILED  | null
    }

    def "a failure on a slot another runner holds (or that is gone) is not recorded: that runner is handling it"() {
        when:
        generator.recordFailure(6L, "boom")

        then:
        1 * queueRepository.findByIdForUpdateSkipLocked(6L) >> Optional.empty()
        0 * queueRepository.save(_)
    }

    def "the stored error is cut to the column's 500 characters, and a row no longer pending is left alone"() {
        given:
        def finished = item(status: GroupSessionGenerationItem.Status.DONE)
        queueRepository.findByIdForUpdateSkipLocked(4L) >> Optional.of(finished)

        when:
        generator.recordFailure(1L, "x" * 900)
        generator.recordFailure(4L, "late")

        then:
        queued.lastError.length() == 500
        finished.attempts == 0
        1 * queueRepository.save(queued)
        0 * queueRepository.save(finished)
    }
}

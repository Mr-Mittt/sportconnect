package com.sportconnect.session.record

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.RecordUpdateOperation
import com.sportconnect.session.api.dto.RecordChangeSetRequest
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.event.SessionRecordVerificationRequestedEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.session.service.SessionOutboxWriter
import com.sportconnect.social.post.api.service.CommentService
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.user.api.dto.UserSummaryResponse
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

/** SESSION-72: propose and confirm a record as a ranking game, the revision, and who is told. */
class SessionRecordRankingSpec extends Specification {

    static final Instant NOW = Instant.parse("2026-11-23T12:00:00Z")
    static final Long SESSION_ID = 7L
    static final Long SPORT_ID = 3L
    static final Long RECORD_ID = 50L
    UUID proposer = UUID.randomUUID()
    UUID p2 = UUID.randomUUID()
    UUID p3 = UUID.randomUUID()
    UUID p4 = UUID.randomUUID()

    SessionRepository sessionRepository = Mock()
    SessionRecordRepository recordRepository = Mock()
    SessionParticipantRepository participantRepository = Mock()
    SessionRecordGate gate = Mock()
    SportService sportService = Mock()
    CommentService commentService = Mock()
    UserService userService = Mock()
    SessionOutboxWriter sessionOutboxWriter = Mock()
    SessionRecordVerificationRepository verificationRepository = Mock()
    RecordReaders readers = new RecordReaders([new CompetitiveRecordReader()])
    RecordRankingSupport rankingSupport = new RecordRankingSupport(verificationRepository, readers)

    Session current
    Map schema = [maxRecords: 50, record: [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2],
                                                   score: [slot: [[required: true, rule: '>=0']]]]]]
    SessionParticipant callerParticipation
    Set<UUID> active = null   // null: everyone is active
    SessionRecord stored
    List<SessionRecordVerification> confirmations = []
    List<SessionRecordVerification> saved = []

    @Subject
    SessionRecordServiceImpl service = new SessionRecordServiceImpl(sessionRepository, recordRepository,
            participantRepository, gate, sportService, new ObjectMapper(), commentService, userService, sessionOutboxWriter,
            verificationRepository, readers, rankingSupport)

    def setup() {
        service.clock = Clock.fixed(NOW, ZoneOffset.UTC)
        current = session(SessionStatus.ONGOING, NOW.plus(Duration.ofHours(1)))
        callerParticipation = new SessionParticipant(userId: proposer, sessionId: SESSION_ID, status: ParticipantStatus.JOINED)
        stored = record(game([proposer, p2], [p3, p4], 21, 18))
        sessionRepository.findById(SESSION_ID) >> { Optional.of(current) }
        gate.require(_, _, _, _, _, _) >> { args -> args[0] }
        sportService.getResultSchema(SPORT_ID) >> { schema }
        participantRepository.findBySessionIdAndUserId(SESSION_ID, _) >> { args ->
            args[1] == proposer ? Optional.ofNullable(callerParticipation) : Optional.empty()
        }
        recordRepository.findOneForUpdate(SESSION_ID, RECORD_ID) >> { Optional.ofNullable(stored) }
        recordRepository.findBySessionIdOrderByIdAsc(SESSION_ID) >> { [stored] }
        verificationRepository.findByRecordIdIn(_) >> { confirmations }
        verificationRepository.findByRecordIdAndUserId(RECORD_ID, _) >> { args ->
            Optional.ofNullable(confirmations.find { it.userId == args[1] })
        }
        verificationRepository.save(_) >> { args -> saved << args[0]; confirmations << args[0]; args[0] }
        userService.getActiveUserIds(_) >> { args -> active == null ? args[0].toSet() : args[0].findAll { active.contains(it) }.toSet() }
        userService.getUserSummariesByIds(_) >> { args -> args[0].collectEntries { [(it): UserSummaryResponse.builder().id(it).fullName('X').build()] } }
    }

    private static Session session(SessionStatus status, Instant end) {
        Session.builder().id(SESSION_ID).sportId(SPORT_ID).status(status).postId(70L).createdBy(UUID.randomUUID())
                .scheduledStart(end.minus(Duration.ofHours(2))).scheduledEndAt(end).build()
    }

    private static Map game(List one, List two, Integer s1 = null, Integer s2 = null) {
        [teams: [[players: one*.toString(), scores: [s1]], [players: two*.toString(), scores: [s2]]]]
    }

    private SessionRecord record(Map data, Integer revision = 1) {
        SessionRecord.builder().id(RECORD_ID).sessionId(SESSION_ID).data(data).revision(revision)
                .clientRequestId(UUID.randomUUID()).createdBy(proposer).createdAt(NOW).updatedBy(proposer).updatedAt(NOW).build()
    }

    // --- propose ---

    def "a joined player proposes a rankable game: it is stored, the proposer's own confirmation too, the other three are told"() {
        given:
        def sent = []
        sessionOutboxWriter.record("session.record.verification_requested", _) >> { args -> sent << args[1] }

        when:
        def dto = service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        stored.rankingRequestedBy == proposer
        stored.rankingRequestedAt == NOW
        saved*.userId == [proposer]
        saved[0].revision == 1
        sent.size() == 3
        sent*.recipientUserId.toSet() == [p2, p3, p4].toSet()
        sent.every { it.actorId == proposer && it.sessionId == SESSION_ID && it.recordId == RECORD_ID }
        dto.ranking.status.name() == 'PROPOSED'
    }

    def "a planned game with no score can be proposed: no confirmation yet, the players are told"() {
        given:
        stored = record(game([proposer], [p2]))
        def sent = []
        sessionOutboxWriter.record("session.record.verification_requested", _) >> { args -> sent << args[1] }

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        stored.rankingRequestedAt == NOW
        saved.isEmpty()
        sent*.recipientUserId == [p2]
    }

    def "a proposer who is not a named player confirms nothing and is not notified, all four players are"() {
        given:
        stored = record(game([p2, p3], [p4, UUID.randomUUID()], 21, 10))
        def sent = []
        sessionOutboxWriter.record("session.record.verification_requested", _) >> { args -> sent << args[1] }

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        saved.isEmpty()
        sent.size() == 4
        !sent*.recipientUserId.contains(proposer)
    }

    def "proposing again changes nothing and notifies nobody"() {
        given:
        stored.rankingRequestedBy = p2
        stored.rankingRequestedAt = NOW.minusSeconds(60)

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        stored.rankingRequestedBy == p2
        stored.rankingRequestedAt == NOW.minusSeconds(60)
        saved.isEmpty()
        0 * sessionOutboxWriter.record(*_)
    }

    def "a deactivated player is not notified"() {
        given:
        active = [proposer, p2, p4] as Set
        def sent = []
        sessionOutboxWriter.record("session.record.verification_requested", _) >> { args -> sent << args[1] }

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        sent*.recipientUserId.toSet() == [p2, p4].toSet()
    }

    def "only a JOINED participant can propose: #why"() {
        given:
        callerParticipation = participation

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        def e = thrown(ForbiddenException)
        e.errorCode == "SESSION_RECORD_RANKING_PROPOSER_NOT_JOINED"
        stored.rankingRequestedAt == null
        0 * sessionOutboxWriter.record(*_)

        where:
        why                    | participation
        'no participant row'   | null
        'only requested'       | new SessionParticipant(status: ParticipantStatus.REQUESTED)
        'only invited'         | new SessionParticipant(status: ParticipantStatus.INVITED)
        'left the session'     | new SessionParticipant(status: ParticipantStatus.LEFT)
    }

    def "proposing is allowed in a #status session and refused in #closed"() {
        when:
        current = session(status, NOW.plus(Duration.ofHours(1)))
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        stored.rankingRequestedAt == NOW

        when:
        stored.rankingRequestedAt = null
        current = session(closed, NOW.plus(Duration.ofHours(1)))
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        thrown(ConflictException)

        where:
        status                   | closed
        SessionStatus.SCHEDULED  | SessionStatus.PREPARING
        SessionStatus.ONGOING    | SessionStatus.CANCELLED
    }

    def "proposing in a completed session is allowed up to 24 hours after it ended and refused after"() {
        when:
        current = session(SessionStatus.COMPLETED, NOW.minus(Duration.ofHours(23)))
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        stored.rankingRequestedAt == NOW

        when:
        stored.rankingRequestedAt = null
        current = session(SessionStatus.COMPLETED, NOW.minus(Duration.ofHours(25)))
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_WINDOW_CLOSED"
    }

    def "a sport whose schema has no score slot, or an unknown record type, has no ranking games"() {
        given:
        schema = override

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_RANKING_NOT_AVAILABLE"

        where:
        override << [
                [record: [data: [type: 'COMPETITIVE', playersPerSide: [min: 1, max: 2], score: [slot: []]]]],
                [record: [data: [type: 'PERSONAL_BEST']]],
                [kind: 'MATCH']
        ]
    }

    def "a scored game whose first team is not ahead cannot be proposed, with the reason as a parameter"() {
        given:
        stored = record(game([proposer], [p2], 10, 21))

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_RANKING_NOT_RANKABLE"
        e.errorParams == [reason: 'FIRST_TEAM_NOT_AHEAD']
        stored.rankingRequestedAt == null
    }

    def "an unknown or other session's record is 404 SESSION_RECORD_NOT_FOUND"() {
        given:
        stored = null

        when:
        service.requestRanking(SESSION_ID, RECORD_ID, proposer)

        then:
        def e = thrown(ResourceNotFoundException)
        e.errorCode == "SESSION_RECORD_NOT_FOUND"
    }

    // --- verify ---

    def "a named player confirms a proposed rankable game at its current revision"() {
        given:
        stored.rankingRequestedBy = proposer
        stored.rankingRequestedAt = NOW
        stored.revision = 3
        callerParticipation = null

        when:
        def dto = service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        saved.size() == 1
        saved[0].userId == p2
        saved[0].revision == 3
        saved[0].verifiedAt == NOW
        dto.ranking.confirmedBy == [p2]
    }

    def "confirming twice at the same revision writes nothing the second time"() {
        given:
        stored.rankingRequestedAt = NOW
        confirmations << new SessionRecordVerification(recordId: RECORD_ID, userId: p2, revision: 1, verifiedAt: NOW.minusSeconds(5))

        when:
        service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        0 * verificationRepository.save(_)
        confirmations[0].verifiedAt == NOW.minusSeconds(5)
    }

    def "a confirmation of an older revision is overwritten by the new one"() {
        given:
        stored.rankingRequestedAt = NOW
        stored.revision = 2
        def old = new SessionRecordVerification(recordId: RECORD_ID, userId: p2, revision: 1, verifiedAt: NOW.minusSeconds(5))
        confirmations << old

        when:
        service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        1 * verificationRepository.save(old)
        old.revision == 2
        old.verifiedAt == NOW
    }

    def "a player who is not named in the game cannot confirm it"() {
        given:
        stored.rankingRequestedAt = NOW

        when:
        service.verify(SESSION_ID, RECORD_ID, UUID.randomUUID())

        then:
        def e = thrown(ForbiddenException)
        e.errorCode == "SESSION_RECORD_VERIFY_NOT_A_PLAYER"
        saved.isEmpty()
    }

    def "a game that was never proposed cannot be confirmed"() {
        when:
        service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_NOT_PROPOSED"
        saved.isEmpty()
    }

    def "a planned game with no score cannot be confirmed yet"() {
        given:
        stored = record(game([proposer], [p2]))
        stored.rankingRequestedAt = NOW

        when:
        service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_RANKING_NOT_RANKABLE"
        e.errorParams == [reason: 'NO_SCORE']
        saved.isEmpty()
    }

    def "confirming is refused outside the window and in a closed status"() {
        given:
        stored.rankingRequestedAt = NOW
        current = session(status, end)

        when:
        service.verify(SESSION_ID, RECORD_ID, p2)

        then:
        def e = thrown(ConflictException)
        e.errorCode == code

        where:
        status                    | end                                | code
        SessionStatus.COMPLETED   | NOW.minus(Duration.ofHours(25))    | "SESSION_RECORD_WINDOW_CLOSED"
        SessionStatus.CANCELLED   | NOW.plus(Duration.ofHours(1))      | "SESSION_RECORD_NOT_LOGGABLE"
    }

    // --- state ---

    def "the state is VERIFIED only when every player has confirmed the current revision"() {
        given:
        stored.rankingRequestedBy = proposer
        stored.rankingRequestedAt = NOW
        stored.revision = 2
        [proposer, p2, p3].each { confirmations << new SessionRecordVerification(recordId: RECORD_ID, userId: it, revision: 2, verifiedAt: NOW) }
        confirmations << new SessionRecordVerification(recordId: RECORD_ID, userId: p4, revision: 1, verifiedAt: NOW)

        expect: "p4 confirmed an older revision, so it does not count"
        service.getRecords(SESSION_ID, proposer)[0].ranking.status.name() == 'PROPOSED'
        service.getRecords(SESSION_ID, proposer)[0].ranking.confirmedBy.toSet() == [proposer, p2, p3].toSet()

        when:
        confirmations.last().revision = 2

        then:
        service.getRecords(SESSION_ID, proposer)[0].ranking.status.name() == 'VERIFIED'
    }

    def "a game never proposed is NORMAL, and a proposed game with no reader never reads VERIFIED"() {
        expect:
        service.getRecords(SESSION_ID, proposer)[0].ranking.status.name() == 'NORMAL'

        when:
        stored.rankingRequestedAt = NOW
        schema = [kind: 'MATCH']

        then:
        service.getRecords(SESSION_ID, proposer)[0].ranking.status.name() == 'PROPOSED'
    }

    // --- edit: revision and the new request to confirm ---

    private RecordChangeSetRequest update(Map data, List<UUID> players = [proposer, p2, p3, p4]) {
        RecordChangeSetRequest.builder().update([RecordUpdateOperation.builder().id(RECORD_ID).playerIds(players).data(data).build()]).build()
    }

    def "an update that changes the data raises the revision; one that changes nothing does not"() {
        given:
        recordRepository.findForUpdate(SESSION_ID, _) >> { [stored] }
        participantRepository.findBySessionIdAndStatusAndUserIdIn(SESSION_ID, ParticipantStatus.JOINED, _) >> { args ->
            args[2].collect { new SessionParticipant(userId: it, sessionId: SESSION_ID, status: ParticipantStatus.JOINED) }
        }
        recordRepository.countBySessionId(SESSION_ID) >> 1L

        when:
        service.applyChanges(SESSION_ID, proposer, update(game([proposer, p2], [p3, p4], 21, 18)))

        then: "same content: the revision stays"
        stored.revision == 1

        when:
        service.applyChanges(SESSION_ID, proposer, update(game([proposer, p2], [p3, p4], 21, 19)))

        then:
        stored.revision == 2
    }

    def "changing a proposed game asks its other players again, and changing a normal game asks nobody"() {
        given:
        recordRepository.findForUpdate(SESSION_ID, _) >> { [stored] }
        participantRepository.findBySessionIdAndStatusAndUserIdIn(SESSION_ID, ParticipantStatus.JOINED, _) >> { args ->
            args[2].collect { new SessionParticipant(userId: it, sessionId: SESSION_ID, status: ParticipantStatus.JOINED) }
        }
        recordRepository.countBySessionId(SESSION_ID) >> 1L
        def sent = []
        sessionOutboxWriter.record("session.record.verification_requested", _) >> { args -> sent << args[1] }
        sessionOutboxWriter.record("session.record.changed", _) >> { }

        when: "a normal game is edited"
        service.applyChanges(SESSION_ID, proposer, update(game([proposer, p2], [p3, p4], 21, 19)))

        then:
        sent.isEmpty()

        when: "a proposed game is edited"
        stored.rankingRequestedAt = NOW
        service.applyChanges(SESSION_ID, p2, update(game([proposer, p2], [p3, p4], 21, 15)))

        then:
        sent*.recipientUserId.toSet() == [proposer, p3, p4].toSet()
        sent.every { it.actorId == p2 }

        when: "a proposed game is saved unchanged"
        sent.clear()
        service.applyChanges(SESSION_ID, p2, update(game([proposer, p2], [p3, p4], 21, 15)))

        then:
        sent.isEmpty()
    }
}

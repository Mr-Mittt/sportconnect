package com.sportconnect.session.record

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.RecordAddOperation
import com.sportconnect.session.api.dto.RecordChangeSetRequest
import com.sportconnect.session.api.dto.RecordOperationStatus
import com.sportconnect.session.api.dto.RecordUpdateOperation
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.sport.api.service.SportService
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class SessionRecordServiceImplSpec extends Specification {

    static final Instant NOW = Instant.parse("2026-11-12T12:00:00Z")
    static final Long SESSION_ID = 7L
    static final Long SPORT_ID = 3L
    UUID caller = UUID.randomUUID()
    UUID p1 = UUID.randomUUID()
    UUID p2 = UUID.randomUUID()

    SessionRepository sessionRepository = Mock()
    SessionRecordRepository recordRepository = Mock()
    SessionParticipantRepository participantRepository = Mock()
    SessionRecordGate gate = Mock()
    SportService sportService = Mock()

    // What the stubs below return; a feature changes these instead of re-stubbing (Spock matches the
    // earliest-declared interaction, so a stub in a feature would never override one in setup()).
    Session current
    Map schema = [kind: 'MATCH']
    Set<UUID> joined = null   // null: every named player is JOINED
    List<SessionRecord> locked = []     // what findForUpdate returns (the rows that still exist)
    List<SessionRecord> replays = []    // what a retried add finds by client ref
    List<SessionRecord> listed = []     // the records after the change set
    long liveCount = 0L

    @Subject
    SessionRecordServiceImpl service = new SessionRecordServiceImpl(sessionRepository, recordRepository,
            participantRepository, gate, sportService, new ObjectMapper())

    def setup() {
        service.clock = Clock.fixed(NOW, ZoneOffset.UTC)
        current = session(SessionStatus.ONGOING, NOW.plus(Duration.ofHours(1)))
        sessionRepository.findById(SESSION_ID) >> { Optional.of(current) }
        gate.require(_, _, _, _, _, _) >> { args -> args[0] }
        sportService.getResultSchema(SPORT_ID) >> { schema }
        participantRepository.findBySessionIdAndStatusAndUserIdIn(SESSION_ID, ParticipantStatus.JOINED, _) >> { args ->
            args[2].findAll { joined == null || joined.contains(it) }.collect { new SessionParticipant(userId: it, sessionId: SESSION_ID, status: ParticipantStatus.JOINED) }
        }
        recordRepository.findBySessionIdOrderByIdAsc(SESSION_ID) >> { listed }
        recordRepository.findForUpdate(SESSION_ID, _) >> { locked }
        recordRepository.findBySessionIdAndClientRequestIdIn(SESSION_ID, _) >> { replays }
        recordRepository.countBySessionId(SESSION_ID) >> { liveCount }
        recordRepository.saveAll(_) >> { args ->
            args[0].eachWithIndex { r, i -> r.id = 100L + i }
            args[0]
        }
    }

    private static Session session(SessionStatus status, Instant end) {
        Session.builder().id(SESSION_ID).sportId(SPORT_ID).status(status)
                .scheduledStart(end.minus(Duration.ofHours(2))).scheduledEndAt(end).build()
    }

    private SessionRecord row(Long id, Map data = [winner: 1]) {
        SessionRecord.builder().id(id).sessionId(SESSION_ID).data(data)
                .clientRequestId(UUID.randomUUID()).createdBy(caller).createdAt(NOW).updatedBy(caller).updatedAt(NOW).build()
    }

    private RecordAddOperation add(UUID ref = UUID.randomUUID(), List<UUID> players = [p1, p2], Map data = [winner: 1]) {
        RecordAddOperation.builder().clientRef(ref).playerIds(players).data(data).build()
    }

    private RecordChangeSetRequest request(Map parts) {
        RecordChangeSetRequest.builder().add(parts.add ?: []).update(parts.update ?: []).delete(parts.delete ?: []).build()
    }

    // --- access, status, window ---

    def "a caller without access is refused by the gate before anything else"() {
        given:
        def failing = Mock(SessionRecordGate)
        def other = new SessionRecordServiceImpl(sessionRepository, recordRepository,
                participantRepository, failing, sportService, new ObjectMapper())
        failing.require(_, _, _, _, _, _) >> { throw new ForbiddenException("SESSION_RECORD_NOT_ALLOWED", "no", null) }

        when:
        other.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        def e = thrown(ForbiddenException)
        e.errorCode == "SESSION_RECORD_NOT_ALLOWED"
        0 * recordRepository.saveAll(_)
    }

    def "a missing session is a 404 from the gate"() {
        given:
        def failing = Mock(SessionRecordGate)
        def other = new SessionRecordServiceImpl(sessionRepository, recordRepository,
                participantRepository, failing, sportService, new ObjectMapper())
        sessionRepository.findById(99L) >> Optional.empty()
        failing.require(_, _, _, _, _, _) >> { throw new NotFoundException("SESSION_NOT_FOUND", "no", null) }

        when:
        other.getRecords(99L, caller)

        then:
        thrown(NotFoundException)
    }

    def "only ONGOING and COMPLETED sessions can be logged: #status"() {
        given:
        current = session(status, NOW.plus(Duration.ofHours(1)))

        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_NOT_LOGGABLE"

        where:
        status << [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.CANCELLED]
    }

    def "a change 23 hours after the session ended is still accepted"() {
        given:
        current = session(SessionStatus.COMPLETED, NOW.minus(Duration.ofHours(23)))

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        response.results[0].status == RecordOperationStatus.CREATED
    }

    def "a change 25 hours after the session ended is refused"() {
        given:
        current = session(SessionStatus.COMPLETED, NOW.minus(Duration.ofHours(25)))

        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_WINDOW_CLOSED"
    }

    def "a delete is refused after the window too: no one changes a record 25 hours after the end"() {
        given:
        current = session(SessionStatus.COMPLETED, NOW.minus(Duration.ofHours(25)))

        when:
        service.applyChanges(SESSION_ID, caller, request(delete: [1L]))

        then:
        thrown(ConflictException)
        0 * recordRepository.deleteAll(_)
    }

    def "a sport with no result schema, or an inactive one, has no result logging"() {
        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        1 * sportService.getResultSchema(SPORT_ID) >> schema
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_NOT_LOGGABLE"

        where:
        schema << [null]
    }

    def "an inactive sport is not loggable"() {
        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        1 * sportService.getResultSchema(SPORT_ID) >> { throw ResourceNotFoundException.coded("SPORT_NOT_FOUND", "x", null) }
        def e = thrown(ConflictException)
        e.errorCode == "SESSION_RECORD_NOT_LOGGABLE"
    }

    // --- validation ---

    def "a record naming a player who has not joined is rejected alone; the valid ones are stored"() {
        given:
        joined = [p1] as Set
        def bad = UUID.randomUUID()
        def good = UUID.randomUUID()
        List<SessionRecord> saved = null

        when:
        def response = service.applyChanges(SESSION_ID, caller,
                request(add: [add(bad, [p1, p2]), add(good, [p1])]))

        then:
        1 * recordRepository.saveAll(_) >> { args -> saved = args[0]; args[0].eachWithIndex { r, i -> r.id = 100L + i }; args[0] }
        response.results*.status == [RecordOperationStatus.REJECTED, RecordOperationStatus.CREATED]
        response.results[0].clientRef == bad
        response.results[0].errorCode == "SESSION_RECORD_PLAYER_NOT_JOINED"
        response.results[0].id == null
        response.results[1].id == 100L
        saved*.clientRequestId == [good]
    }

    def "a rejected update changes nothing and the other operations still apply"() {
        given:
        joined = [p1] as Set
        def target = row(1L, [winner: 1])
        locked = [row(2L)]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(
                update: [RecordUpdateOperation.builder().id(1L).playerIds([p1, p2]).data([winner: 2]).build()],
                delete: [2L]))

        then:
        response.results*.status == [RecordOperationStatus.REJECTED, RecordOperationStatus.DELETED]
        response.results[0].requestedId == 1L
        response.results[0].errorCode == "SESSION_RECORD_PLAYER_NOT_JOINED"
        1 * recordRepository.deleteAll({ it*.id == [2L] })
        target.data == [winner: 1]
    }

    def "every player of a change set is checked with one query"() {
        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add(UUID.randomUUID(), [p1]), add(UUID.randomUUID(), [p2])]))

        then:
        1 * participantRepository.findBySessionIdAndStatusAndUserIdIn(SESSION_ID, ParticipantStatus.JOINED, { it as Set == [p1, p2] as Set }) >> [
                new SessionParticipant(userId: p1, sessionId: SESSION_ID, status: ParticipantStatus.JOINED),
                new SessionParticipant(userId: p2, sessionId: SESSION_ID, status: ParticipantStatus.JOINED)]
    }

    def "an invalid record is rejected alone and the valid one beside it is stored: #label"() {
        given:
        def good = UUID.randomUUID()
        def badRequest = request(add: [bad, add(good, [p1])])

        when:
        def response = service.applyChanges(SESSION_ID, caller, badRequest)

        then:
        response.results*.status == [RecordOperationStatus.REJECTED, RecordOperationStatus.CREATED]
        response.results[0].errorCode == "SESSION_RECORD_INVALID"
        1 * recordRepository.saveAll({ it*.clientRequestId == [good] }) >> { args -> args[0].eachWithIndex { r, i -> r.id = 100L + i }; args[0] }

        where:
        label              | bad
        "no players"       | add(UUID.randomUUID(), [])
        "repeated player"  | add(UUID.randomUUID(), [UUID.fromString("00000000-0000-0000-0000-000000000001"), UUID.fromString("00000000-0000-0000-0000-000000000001")])
        "missing data"     | RecordAddOperation.builder().clientRef(UUID.randomUUID()).playerIds([UUID.randomUUID()]).build()
    }

    def "a malformed request is refused whole: #label"() {
        when:
        service.applyChanges(SESSION_ID, caller, req)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "SESSION_RECORD_INVALID"
        0 * recordRepository.saveAll(_)
        0 * recordRepository.deleteAll(_)

        where:
        label                | req
        "missing clientRef"  | request(add: [RecordAddOperation.builder().playerIds([UUID.randomUUID()]).data([a: 1]).build()])
        "update without id"  | request(update: [RecordUpdateOperation.builder().playerIds([UUID.randomUUID()]).data([a: 1]).build()])
        "same id updated twice" | request(update: [
                RecordUpdateOperation.builder().id(1L).playerIds([UUID.randomUUID()]).data([a: 1]).build(),
                RecordUpdateOperation.builder().id(1L).playerIds([UUID.randomUUID()]).data([a: 2]).build()])
        "null delete id"     | request(delete: [null])
    }

    def "a repeated clientRef in one request is invalid"() {
        given:
        def ref = UUID.randomUUID()

        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add(ref), add(ref)]))

        then:
        thrown(BadRequestException)
    }

    def "more than 50 operations are refused"() {
        when:
        service.applyChanges(SESSION_ID, caller, request(delete: (1L..51L).toList()))

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "SESSION_RECORD_INVALID"
    }

    def "data nested deeper than 10 levels is refused"() {
        given:
        Map deep = [a: 1]
        10.times { deep = [n: deep] }   // 11 levels including the root

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add(UUID.randomUUID(), [p1], deep)]))

        then:
        response.results[0].status == RecordOperationStatus.REJECTED
        response.results[0].errorCode == "SESSION_RECORD_INVALID"
    }

    def "data nested exactly 10 levels is accepted"() {
        given:
        Map ok = [a: 1]
        9.times { ok = [n: ok] }        // 10 levels including the root

        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add(UUID.randomUUID(), [p1], ok)]))

        then:
        noExceptionThrown()
    }

    def "data over the fixed 4 KB record cap is refused with its limit, whatever the sport schema says"() {
        given:
        schema = [maxRecordBytes: 100000]   // no longer read

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add(UUID.randomUUID(), [p1], [note: "x" * 5000])]))

        then:
        response.results[0].status == RecordOperationStatus.REJECTED
        response.results[0].errorCode == "SESSION_RECORD_TOO_LARGE"
        response.results[0].errorParams == [maxBytes: 4096]
    }

    def "data just under the 4 KB cap is accepted"() {
        when:
        service.applyChanges(SESSION_ID, caller, request(add: [add(UUID.randomUUID(), [p1], [note: "x" * 4000])]))

        then:
        noExceptionThrown()
    }

    def "an add that would pass maxRecords is rejected with the limit"() {
        given:
        schema = [maxRecords: 3]
        liveCount = 3L

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add()]))

        then:
        response.results[0].status == RecordOperationStatus.REJECTED
        response.results[0].errorCode == "SESSION_RECORD_LIMIT_REACHED"
        response.results[0].errorParams == [maxRecords: 3]
        0 * recordRepository.saveAll({ !it.isEmpty() })
    }

    def "when only some new records fit under maxRecords, the first ones are stored and the rest rejected"() {
        given:
        schema = [maxRecords: 3]
        liveCount = 2L
        def a = UUID.randomUUID()
        def b = UUID.randomUUID()
        List<SessionRecord> saved = null

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add(a, [p1]), add(b, [p1])]))

        then:
        1 * recordRepository.saveAll(_) >> { args -> saved = args[0]; args[0].eachWithIndex { r, i -> r.id = 100L + i }; args[0] }
        response.results*.status == [RecordOperationStatus.CREATED, RecordOperationStatus.REJECTED]
        response.results[1].errorCode == "SESSION_RECORD_LIMIT_REACHED"
        response.results[1].id == null
        saved*.clientRequestId == [a]
    }

    def "the limit counts live rows minus the deletes in the same change set plus the creations"() {
        given:
        schema = [maxRecords: 3]
        liveCount = 3L
        locked = [row(1L)]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add()], delete: [1L]))   // 3 - 1 + 1 = 3

        then:
        response.results*.status == [RecordOperationStatus.CREATED, RecordOperationStatus.DELETED]
    }

    // --- add ---

    def "an add stores the data as sent, the caller as author, and not the player ids"() {
        given:
        def ref = UUID.randomUUID()
        List<SessionRecord> saved = null

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add(ref)]))

        then:
        response.results.size() == 1
        response.results[0].clientRef == ref
        response.results[0].status == RecordOperationStatus.CREATED
        response.results[0].id == 100L
        1 * recordRepository.saveAll(_) >> { args -> saved = args[0]; args[0].eachWithIndex { r, i -> r.id = 100L + i }; args[0] }
        saved.size() == 1
        saved[0].data == [winner: 1]
        saved[0].clientRequestId == ref
        saved[0].createdBy == caller
        !saved[0].hasProperty('players')
    }

    def "a retried add with a known clientRef returns the stored record and creates nothing"() {
        given:
        def ref = UUID.randomUUID()
        def stored = row(55L)
        stored.clientRequestId = ref
        replays = [stored]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(add: [add(ref)]))

        then:
        response.results[0].status == RecordOperationStatus.UNCHANGED
        response.results[0].id == 55L
        1 * recordRepository.saveAll({ it.isEmpty() }) >> []
    }

    // --- update ---

    def "an update replaces the data in place"() {
        given:
        def existing = row(10L, [winner: 1])
        locked = [existing]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(update: [
                RecordUpdateOperation.builder().id(10L).playerIds([p1]).data([winner: 2]).build()]))

        then:
        response.results[0].status == RecordOperationStatus.UPDATED
        response.results[0].id == 10L
        existing.data == [winner: 2]
        existing.updatedBy == caller
    }

    def "an update of a record that was deleted meanwhile restores it under a new id"() {
        given:
        locked = []
        List<SessionRecord> saved = null

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(update: [
                RecordUpdateOperation.builder().id(10L).playerIds([p1]).data([winner: 2]).build()]))

        then:
        response.results[0].status == RecordOperationStatus.RESTORED
        response.results[0].requestedId == 10L
        response.results[0].id == 100L
        1 * recordRepository.saveAll(_) >> { args -> saved = args[0]; args[0].eachWithIndex { r, i -> r.id = 100L + i }; args[0] }
        saved.size() == 1
        saved[0].data == [winner: 2]
    }

    // --- delete ---

    def "a delete removes the record"() {
        given:
        def existing = row(10L, [winner: 1])
        locked = [existing]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(delete: [10L]))

        then:
        response.results[0].status == RecordOperationStatus.DELETED
        1 * recordRepository.deleteAll({ it == [existing] })
    }

    def "deleting a record that is already gone is a no-op success"() {
        given:
        locked = []

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(delete: [10L]))

        then:
        response.results[0].status == RecordOperationStatus.UNCHANGED
        1 * recordRepository.deleteAll({ it.isEmpty() })
    }

    def "an id both updated and deleted in one change set is deleted"() {
        given:
        def existing = row(10L)
        locked = [existing]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(
                update: [RecordUpdateOperation.builder().id(10L).playerIds([p1]).data([winner: 2]).build()],
                delete: [10L]))

        then:
        response.results*.status == [RecordOperationStatus.UNCHANGED, RecordOperationStatus.DELETED]
        existing.data == [winner: 1]
        1 * recordRepository.deleteAll({ it == [existing] })
    }

    def "a mixed change set reports adds, then updates, then deletes"() {
        given:
        def toUpdate = row(10L)
        def toDelete = row(11L)
        locked = [toUpdate, toDelete]

        when:
        def response = service.applyChanges(SESSION_ID, caller, request(
                add: [add()],
                update: [RecordUpdateOperation.builder().id(10L).playerIds([p1]).data([winner: 2]).build()],
                delete: [11L]))

        then:
        response.results*.status == [RecordOperationStatus.CREATED, RecordOperationStatus.UPDATED, RecordOperationStatus.DELETED]
    }

    // --- reads ---

    def "records come back with the ids and content the client needs"() {
        given:
        listed = [row(1L), row(2L)]

        expect:
        service.getRecords(SESSION_ID, caller)*.id == [1L, 2L]
    }
}

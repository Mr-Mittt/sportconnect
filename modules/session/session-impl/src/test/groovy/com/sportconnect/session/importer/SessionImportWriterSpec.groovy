package com.sportconnect.session.importer

import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.api.dto.GroupAudience
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.record.SessionRecord
import com.sportconnect.session.record.SessionRecordRepository
import com.sportconnect.session.repository.SessionParticipantRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.social.post.api.service.PostService
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant

/** SESSION-70: the rows one imported session becomes. The real tables are {@code SessionImportIntegrationTest}'s. */
class SessionImportWriterSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    SessionParticipantRepository participantRepository = Mock()
    SessionRecordRepository recordRepository = Mock()
    PostService postService = Mock()

    @Subject
    SessionImportWriter writer = new SessionImportWriter(sessionRepository, participantRepository, recordRepository, postService)

    private static boolean keep(List box, Object x) { box << x; true }

    private static boolean keepAll(List box, Collection x) { box.addAll(x); true }

    UUID host = UUID.randomUUID()
    UUID a = UUID.randomUUID()
    UUID b = UUID.randomUUID()
    UUID c = UUID.randomUUID()
    UUID d = UUID.randomUUID()

    def "a COMPLETED private group session is made with its companion post first, authored by the host"() {
        given:
        def item = new SessionImportWriter.Item('T', Instant.parse('2026-10-29T00:00:00Z'), Instant.parse('2026-10-29T02:00:00Z'),
                [new SessionImportWriter.Game([a, b], [c, d])])
        def box = []

        when:
        def id = writer.write(item, 46L, 1L, 7L, host)

        then:
        1 * postService.createSessionPost(host, 'Session: T') >> 900L
        1 * sessionRepository.save({ keep(box, it) }) >> { Session s -> s.id = 501L; s }
        id == 501L
        Session saved = box[0]
        saved.groupId == 46L
        saved.sportId == 1L
        saved.locationId == 7L
        saved.postId == 900L
        saved.createdBy == host
        saved.status == SessionStatus.COMPLETED
        saved.sessionType == SessionType.GROUP_RECURRING
        saved.isPublic == false
        saved.groupAudience == GroupAudience.ALL_MEMBERS
        saved.feeType == FeeType.FREE
        saved.scheduledStart == Instant.parse('2026-10-29T00:00:00Z')
        saved.scheduledEndAt == Instant.parse('2026-10-29T02:00:00Z')
    }

    def "the host and every player are JOINED once, however often they play"() {
        given:
        def item = new SessionImportWriter.Item('T', Instant.EPOCH, Instant.EPOCH.plusSeconds(60),
                [new SessionImportWriter.Game([a, b], [c, d]), new SessionImportWriter.Game([a, c], [b, d])])
        def box = []

        when:
        writer.write(item, 46L, 1L, 7L, host)

        then:
        postService.createSessionPost(_, _) >> 900L
        sessionRepository.save(_) >> { Session s -> s.id = 5L; s }
        1 * participantRepository.saveAll({ keepAll(box, it) })
        List<SessionParticipant> saved = box
        saved*.userId as Set == [host, a, b, c, d] as Set
        saved.size() == 5
        saved.every { it.status == ParticipantStatus.JOINED && it.sessionId == 5L }
    }

    def "one record per game in order: the winners' side first, no score, the players as ids"() {
        given:
        def item = new SessionImportWriter.Item('T', Instant.EPOCH, Instant.EPOCH.plusSeconds(60),
                [new SessionImportWriter.Game([a, b], [c, d]), new SessionImportWriter.Game([c], [a])])
        def box = []

        when:
        writer.write(item, 46L, 1L, 7L, host)

        then:
        postService.createSessionPost(_, _) >> 900L
        sessionRepository.save(_) >> { Session s -> s.id = 5L; s }
        1 * recordRepository.saveAll({ keepAll(box, it) })
        List<SessionRecord> saved = box
        saved.size() == 2
        saved[0].data.teams[0].players == [a.toString(), b.toString()]
        saved[0].data.teams[1].players == [c.toString(), d.toString()]
        saved[0].data.teams.every { it.scores == [null] }
        saved[1].data.teams[0].players == [c.toString()]
        saved[1].data.teams[1].players == [a.toString()]
        saved.every { it.sessionId == 5L && it.createdBy == host && it.updatedBy == host }
        saved[0].clientRequestId != saved[1].clientRequestId
    }
}

package com.sportconnect.session.service

import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.event.SessionGroupCancelledEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionRepository
import spock.lang.Specification
import spock.lang.Subject

/** SESSION-GROUP-6: cancelling scheduled regular sessions for a rule change. */
class RegularSessionCancellerSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    SessionOutboxEventRepository outboxRepository = Mock()
    SessionOutboxWriter outboxWriter = Mock()
    GroupSessionRecipients recipients = Mock()

    @Subject
    RegularSessionCanceller canceller = new RegularSessionCanceller(sessionRepository, outboxRepository, outboxWriter, recipients)

    UUID actor = UUID.randomUUID()

    private Session session(Long id) {
        Session.builder().id(id).groupId(5L).recurrenceId(7L).status(SessionStatus.SCHEDULED).build()
    }

    def "every session is cancelled with the reason, the actor and a time, then saved once"() {
        given:
        def a = session(1L)
        def b = session(2L)

        when:
        def count = canceller.cancel([a, b], actor, "Because")

        then:
        1 * sessionRepository.saveAll([a, b])
        _ * recipients.of(_, actor, true) >> []
        count == 2
        [a, b].every { it.status == SessionStatus.CANCELLED && it.cancelReason == "Because" && it.cancelledBy == actor && it.cancelledAt != null }
    }

    def "each session's audience and players are told with session.group.cancelled, the actor as the actor"() {
        given:
        def a = session(1L)
        def b = session(2L)
        def u1 = UUID.randomUUID()
        def u2 = UUID.randomUUID()
        def told = []

        when:
        canceller.cancel([a, b], actor, "Because")

        then:
        1 * recipients.of(a, actor, true) >> [u1, u2]
        1 * recipients.of(b, actor, true) >> [u1]
        3 * outboxWriter.build("session.group.cancelled", _) >> { String type, Object payload -> told << payload; new SessionOutboxEvent() }
        1 * outboxRepository.saveAll({ List l -> l.size() == 3 })
        told.every { it instanceof SessionGroupCancelledEvent && it.actorId == actor && it.groupId == 5L }
        told.collect { [it.sessionId, it.recipientUserId] } as Set == [[1L, u1], [1L, u2], [2L, u1]] as Set
    }

    def "no session means nothing is touched; nobody to tell writes no events"() {
        when:
        def none = canceller.cancel([], actor, "Because")
        def quiet = canceller.cancel([session(3L)], actor, "Because")

        then:
        none == 0
        quiet == 1
        1 * sessionRepository.saveAll(_)
        1 * recipients.of(_, actor, true) >> []
        0 * outboxRepository.saveAll(_)
    }
}

package com.sportconnect.session.job

import com.sportconnect.session.service.SessionGenerationService
import spock.lang.Specification
import spock.lang.Subject

class SessionGenerationJobSpec extends Specification {

    SessionGenerationService sessionGenerationService = Mock()

    @Subject
    SessionGenerationJob job = new SessionGenerationJob(sessionGenerationService)

    def "generateUpcomingSessions delegates to the service"() {
        when:
        job.generateUpcomingSessions()

        then:
        1 * sessionGenerationService.generateUpcomingSessions()
    }

    def "startOngoingSessions delegates to the service"() {
        when:
        job.startOngoingSessions()

        then:
        1 * sessionGenerationService.startOngoingSessions()
    }

    def "closePastSessions delegates to the service"() {
        when:
        job.closePastSessions()

        then:
        1 * sessionGenerationService.closePastSessions()
    }
}

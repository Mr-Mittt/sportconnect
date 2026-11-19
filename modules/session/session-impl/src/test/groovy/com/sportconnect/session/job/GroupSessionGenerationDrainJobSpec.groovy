package com.sportconnect.session.job

import com.sportconnect.session.service.GroupSessionGenerationWorker
import org.springframework.scheduling.annotation.Scheduled
import spock.lang.Specification

/** SESSION-GROUP-5 review: the 60-second safety net only nudges the worker. */
class GroupSessionGenerationDrainJobSpec extends Specification {

    GroupSessionGenerationWorker worker = Mock()
    GroupSessionGenerationDrainJob job = new GroupSessionGenerationDrainJob(worker)

    def "a tick nudges the worker and does nothing else"() {
        when:
        job.drain()

        then:
        1 * worker.nudge()
        0 * _
    }

    def "it runs every 60 seconds, after a first delay of 60 seconds"() {
        given:
        def scheduled = GroupSessionGenerationDrainJob.getMethod("drain").getAnnotation(Scheduled)

        expect:
        scheduled.fixedDelay() == 60_000L
        scheduled.initialDelay() == 60_000L
    }
}

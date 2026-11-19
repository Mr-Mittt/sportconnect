package com.sportconnect.session.service

import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDate

/** SESSION-GROUP-5: the producers of the generation queue route to the planner, then nudge the asynchronous worker, and never throw. */
class GroupSessionGenerationListenerSpec extends Specification {

    GroupSessionGenerationPlanner planner = Mock()
    GroupSessionGenerationWorker worker = Mock()

    @Subject
    GroupSessionGenerationListener listener = new GroupSessionGenerationListener(planner, worker)

    def "startup queues every enabled group's nearest day, then nudges the worker"() {
        when:
        listener.onStartup()

        then:
        1 * planner.enqueueForAllEnabledGroups() >> 2
        then:
        1 * worker.nudge()
    }

    def "a configuration change queues that group, then nudges the worker"() {
        when:
        listener.onConfigChanged(new GroupSessionGenerationEvents.ConfigChanged(10L))

        then:
        1 * planner.enqueueAfterConfigurationChange(10L)
        then:
        1 * worker.nudge()
    }

    def "regular sessions ending hand their days to the planner, then nudge the worker"() {
        given:
        def days = [new GroupSessionGenerationEvents.GroupDay(10L, LocalDate.of(2026, 11, 20))]

        when:
        listener.onRegularSessionsEnded(new GroupSessionGenerationEvents.RegularSessionsEnded(days))

        then:
        1 * planner.enqueueAfterDaysEnded(days)
        then:
        1 * worker.nudge()
    }

    def "a failure in any producer is swallowed: the change that caused it must never fail"() {
        when:
        listener.onStartup()
        listener.onConfigChanged(new GroupSessionGenerationEvents.ConfigChanged(10L))
        listener.onRegularSessionsEnded(new GroupSessionGenerationEvents.RegularSessionsEnded([]))

        then:
        planner.enqueueForAllEnabledGroups() >> { throw new RuntimeException("db down") }
        planner.enqueueAfterConfigurationChange(_) >> { throw new RuntimeException("db down") }
        planner.enqueueAfterDaysEnded(_) >> { throw new RuntimeException("db down") }
        noExceptionThrown()
        0 * worker.nudge()
    }
}

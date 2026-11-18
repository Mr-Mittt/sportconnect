package com.sportconnect.session.service

import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDate

/** SESSION-GROUP-5: the producers of the generation queue route to the planner, then the runner, and never throw. */
class GroupSessionGenerationListenerSpec extends Specification {

    GroupSessionGenerationPlanner planner = Mock()
    GroupSessionGenerationRunner runner = Mock()

    @Subject
    GroupSessionGenerationListener listener = new GroupSessionGenerationListener(planner, runner)

    def "startup queues every enabled group's nearest day, then drains the queue"() {
        when:
        listener.onStartup()

        then:
        1 * planner.enqueueForAllEnabledGroups() >> 2
        then:
        1 * runner.processDue() >> 2
    }

    def "a configuration change queues that group, then drains the queue"() {
        when:
        listener.onConfigChanged(new GroupSessionGenerationEvents.ConfigChanged(10L))

        then:
        1 * planner.enqueueAfterConfigurationChange(10L)
        then:
        1 * runner.processDue()
    }

    def "regular sessions ending hand their days to the planner, then drain the queue"() {
        given:
        def days = [new GroupSessionGenerationEvents.GroupDay(10L, LocalDate.of(2026, 11, 20))]

        when:
        listener.onRegularSessionsEnded(new GroupSessionGenerationEvents.RegularSessionsEnded(days))

        then:
        1 * planner.enqueueAfterDaysEnded(days)
        then:
        1 * runner.processDue()
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
        0 * runner.processDue()
    }
}

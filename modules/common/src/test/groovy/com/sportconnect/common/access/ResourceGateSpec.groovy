package com.sportconnect.common.access

import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import spock.lang.Specification

class ResourceGateSpec extends Specification {

    static class FakeGate implements ResourceGate<String> {
        boolean available
        boolean visible

        @Override
        boolean isAvailable(String resource) {
            return available
        }

        @Override
        boolean isVisibleTo(String resource, UUID viewerId) {
            return visible
        }
    }

    def "require() throws NotFoundException when the resource is unavailable"() {
        given:
        def gate = new FakeGate(available: false, visible: true)

        when:
        gate.require("resource", UUID.randomUUID(), "not found", "not visible")

        then:
        def ex = thrown(NotFoundException)
        ex.message == "not found"
    }

    def "require() throws NotFoundException when the resource is null, without evaluating visibility"() {
        given:
        def gate = new FakeGate(available: true, visible: true)

        when:
        gate.require(null, UUID.randomUUID(), "not found", "not visible")

        then:
        def ex = thrown(NotFoundException)
        ex.message == "not found"
    }

    def "require() throws ForbiddenException when available but not visible to the caller"() {
        given:
        def gate = new FakeGate(available: true, visible: false)

        when:
        gate.require("resource", UUID.randomUUID(), "not found", "not visible")

        then:
        def ex = thrown(ForbiddenException)
        ex.message == "not visible"
    }

    def "require() returns the resource unchanged when available and visible"() {
        given:
        def gate = new FakeGate(available: true, visible: true)

        when:
        def result = gate.require("resource", UUID.randomUUID(), "not found", "not visible")

        then:
        result == "resource"
    }
}

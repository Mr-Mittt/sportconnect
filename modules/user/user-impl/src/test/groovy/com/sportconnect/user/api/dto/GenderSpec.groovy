package com.sportconnect.user.api.dto

import spock.lang.Specification
import spock.lang.Unroll

class GenderSpec extends Specification {

    @Unroll
    def "fromWire('#value') resolves to #expected"() {
        expect:
        Gender.fromWire(value) == Optional.of(expected)

        where:
        value    | expected
        "MALE"   | Gender.MALE
        "FEMALE" | Gender.FEMALE
    }

    @Unroll
    def "fromWire(#value) is empty - parsing is strict and case-sensitive"() {
        expect:
        Gender.fromWire(value) == Optional.empty()

        where:
        value << [null, "", "male", "Female", " MALE", "MALE ", "M", "OTHER", "asdf"]
    }
}

package com.sportconnect.keycloak

import spock.lang.Specification
import spock.lang.Unroll

class ValidatorInputSpec extends Specification {

    @Unroll
    def "the first value of #input is #expected"() {
        expect:
        ValidatorInput.first(input) == expected

        where:
        input            || expected
        null             || null
        'abc'            || 'abc'
        ['a', 'b']       || 'a'
        []               || null
        [null, 'b']      || null
        [42]             || '42'
    }
}

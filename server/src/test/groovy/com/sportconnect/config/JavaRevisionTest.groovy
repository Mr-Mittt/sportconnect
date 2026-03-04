package com.sportconnect.config

import spock.lang.Specification
import spock.lang.Subject

class JavaRevisionTest extends Specification {

    @Subject
    def java = new JavaRevision()

    def 'memory management'() {
        when:
            def result = java.memoryManagement()
        then:
            assert result == "1"
    }
}

package com.sportconnect.keycloak

import org.keycloak.sessions.AuthenticationSessionModel
import spock.lang.Specification
import spock.lang.Unroll

/** A29: the wait before the account-link email can be sent again (the page counts it down, the server enforces it). */
class LinkExistingAccountResendSpec extends Specification {

    def "no email sent yet means no wait"() {
        given:
        def session = Mock(AuthenticationSessionModel) { getAuthNote(LinkExistingAccountAuthenticator.SENT_AT_NOTE) >> null }

        expect:
        LinkExistingAccountAuthenticator.resendIn(session) == 0
    }

    @Unroll
    def "sent #ago seconds ago leaves #expected seconds of wait"() {
        given:
        def sentAt = String.valueOf(System.currentTimeMillis() - ago * 1000L)
        def session = Mock(AuthenticationSessionModel) { getAuthNote(LinkExistingAccountAuthenticator.SENT_AT_NOTE) >> sentAt }

        expect:
        // the clock keeps running while the test does: allow one second of drift downwards
        LinkExistingAccountAuthenticator.resendIn(session) in [expected, expected - 1].findAll { it >= 0 }

        where:
        ago || expected
        0   || 60
        30  || 30
        59  || 1
        60  || 0
        600 || 0
    }
}

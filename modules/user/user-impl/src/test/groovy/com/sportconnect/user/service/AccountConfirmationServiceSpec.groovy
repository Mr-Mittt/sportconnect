package com.sportconnect.user.service

import com.sportconnect.auth.api.service.KeycloakCredentialService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sportconnect.common.exception.TooManyRequestsException
import com.sportconnect.email.api.EmailMessage
import com.sportconnect.email.api.EmailSender
import com.sportconnect.user.api.dto.ConfirmationPurpose
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration

/**
 * U24: the two ways to prove who is asking, and the one-proof-per-request rule. Redis is behind
 * {@link ConfirmationCodeStore} (mocked here; the real thing is covered by AccountConfirmationIntegrationTest).
 */
class AccountConfirmationServiceSpec extends Specification {

    ConfirmationCodeStore store = Mock()
    KeycloakCredentialService credentials = Mock()
    EmailSender emailSender = Mock()
    ConfirmationEmailMessages messages = new ConfirmationEmailMessages()

    @Subject
    AccountConfirmationService service = new AccountConfirmationService(store, credentials, emailSender, messages)

    UUID userId = UUID.randomUUID()

    // ── sendCode ─────────────────────────────────────────────────────────────

    def "sendCode emails the code in the user's language and reports the countdown"() {
        when:
        def result = service.sendCode(userId, "a@example.com", ConfirmationPurpose.DEACTIVATE, Optional.of(language))

        then:
        1 * store.issue(userId, ConfirmationPurpose.DEACTIVATE) >> "042517"
        2 * store.ttl() >> Duration.ofMinutes(15)
        1 * store.resendInterval() >> Duration.ofSeconds(60)
        1 * emailSender.send({ EmailMessage m ->
            m.to == "a@example.com" && m.subject == subject && m.body.contains("042517") && m.body.contains("15")
        })
        result.resendAfterSeconds == 60
        result.expiresInSeconds == 900

        where:
        language | subject
        "en"     | "Your SportConnect confirmation code"
        "vi-VN"  | "Mã xác nhận SportConnect của bạn"
        "fr"     | "Your SportConnect confirmation code"
    }

    def "sendCode uses the purpose's own wording"() {
        when:
        service.sendCode(userId, "a@example.com", purpose, Optional.empty())

        then:
        1 * store.issue(userId, purpose) >> "111111"
        _ * store.ttl() >> Duration.ofMinutes(15)
        _ * store.resendInterval() >> Duration.ofSeconds(60)
        1 * emailSender.send({ EmailMessage m -> m.body.contains(phrase) })

        where:
        purpose                            | phrase
        ConfirmationPurpose.DEACTIVATE      | "deactivate your SportConnect account"
        ConfirmationPurpose.CHANGE_PASSWORD | "change your SportConnect password"
    }

    def "sendCode refuses an account with no email and issues nothing"() {
        when:
        service.sendCode(userId, email, ConfirmationPurpose.DEACTIVATE, Optional.empty())

        then:
        0 * store.issue(*_)
        0 * emailSender.send(_)
        def e = thrown(BadRequestException)
        e.errorCode == "VERIFICATION_EMAIL_UNAVAILABLE"

        where:
        email << [null, "", "   "]
    }

    def "sendCode sends no email when the resend wait is not over"() {
        when:
        service.sendCode(userId, "a@example.com", ConfirmationPurpose.DEACTIVATE, Optional.empty())

        then:
        1 * store.issue(userId, ConfirmationPurpose.DEACTIVATE) >>
                { throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON", "wait", [seconds: 30L]) }
        0 * emailSender.send(_)
        def e = thrown(TooManyRequestsException)
        e.errorCode == "VERIFICATION_RESEND_TOO_SOON"
    }

    // ── confirm ──────────────────────────────────────────────────────────────

    def "confirm requires exactly one proof"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, password, code)

        then:
        0 * store._
        0 * credentials.verifyPassword(*_)
        def e = thrown(BadRequestException)
        e.errorCode == "CONFIRMATION_REQUIRED"

        where:
        password | code
        null     | null
        ""       | "  "
        "secret" | "123456"
    }

    def "confirm checks the emailed code against the purpose it was asked for"() {
        when:
        service.confirm(userId, ConfirmationPurpose.CHANGE_PASSWORD, null, "123456")

        then:
        1 * store.verify(userId, ConfirmationPurpose.CHANGE_PASSWORD, "123456")
        0 * credentials.verifyPassword(*_)
    }

    def "confirm passes a wrong code through as the store's error"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, null, "000000")

        then:
        1 * store.verify(userId, ConfirmationPurpose.DEACTIVATE, "000000") >>
                { throw new BadRequestException("VERIFICATION_CODE_INVALID", "no", null) }
        def e = thrown(BadRequestException)
        e.errorCode == "VERIFICATION_CODE_INVALID"
    }

    def "confirm accepts the right password and clears the failure count"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, "secret", null)

        then:
        1 * store.checkPasswordAllowed(userId)
        1 * credentials.verifyPassword(userId, "secret") >> true
        1 * store.clearPasswordFailures(userId)
        0 * store.recordPasswordFailure(_)
    }

    def "confirm rejects a wrong password and counts the failure"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, "nope", null)

        then:
        1 * store.checkPasswordAllowed(userId)
        1 * credentials.verifyPassword(userId, "nope") >> false
        1 * store.recordPasswordFailure(userId)
        0 * store.clearPasswordFailures(_)
        def e = thrown(BadRequestException)
        e.errorCode == "CURRENT_PASSWORD_INCORRECT"
    }

    def "confirm does not ask Keycloak once the user is over the failure allowance"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, "again", null)

        then:
        1 * store.checkPasswordAllowed(userId) >>
                { throw new TooManyRequestsException("PASSWORD_ATTEMPTS_EXCEEDED", "wait", [seconds: 600L]) }
        0 * credentials.verifyPassword(*_)
        def e = thrown(TooManyRequestsException)
        e.errorCode == "PASSWORD_ATTEMPTS_EXCEEDED"
    }

    def "confirm passes a Keycloak outage through and counts no failure"() {
        when:
        service.confirm(userId, ConfirmationPurpose.DEACTIVATE, "secret", null)

        then:
        1 * store.checkPasswordAllowed(userId)
        1 * credentials.verifyPassword(userId, "secret") >> { throw new ServiceUnavailableException("down") }
        0 * store.recordPasswordFailure(_)
        thrown(ServiceUnavailableException)
    }
}

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
        ConfirmationPurpose.CHANGE_EMAIL    | "change the email address of your SportConnect account"
        ConfirmationPurpose.NEW_EMAIL       | "this email address is yours"
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

    // ── A33: verification email ──────────────────────────────────

    def "sendVerificationEmail takes the cooldown slot, asks Keycloak and reports the wait"() {
        when:
        def wait = service.sendVerificationEmail(userId, "a@example.com")

        then:
        1 * store.claimEmailVerificationSlot(userId)
        1 * credentials.sendVerificationEmail(userId)
        1 * store.resendInterval() >> Duration.ofSeconds(60)
        wait == 60
    }

    def "sendVerificationEmail without an email asks nobody"() {
        when:
        service.sendVerificationEmail(userId, email)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "VERIFICATION_EMAIL_UNAVAILABLE"
        0 * store._
        0 * credentials._

        where:
        email << [null, "", "  "]
    }

    def "sendVerificationEmail inside the wait is refused before Keycloak is asked"() {
        when:
        service.sendVerificationEmail(userId, "a@example.com")

        then:
        1 * store.claimEmailVerificationSlot(userId) >> { throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON", "wait", [seconds: 30L]) }
        0 * credentials.sendVerificationEmail(_)
        thrown(TooManyRequestsException)
    }

    def "a failed send gives the slot back so the user can try again at once"() {
        when:
        service.sendVerificationEmail(userId, "a@example.com")

        then:
        1 * credentials.sendVerificationEmail(userId) >> { throw new ServiceUnavailableException("down") }
        1 * store.releaseEmailVerificationSlot(userId)
        thrown(ServiceUnavailableException)
    }

    def "isEmailVerifiedInKeycloak asks Keycloak"() {
        when:
        def verified = service.isEmailVerifiedInKeycloak(userId)

        then:
        1 * credentials.isEmailVerified(userId) >> true
        verified
    }

    // ── U26: the new-address code ────────────────────────────────────────────

    def "sendNewEmailCode checks the daily allowance, binds the code to the address, mails that address in the user's language and counts it"() {
        given:
        store.ttl() >> Duration.ofMinutes(15)
        store.resendInterval() >> Duration.ofSeconds(60)

        when:
        def result = service.sendNewEmailCode(userId, "new@example.com", Optional.of(language))

        then:
        1 * store.checkNewEmailCodeAllowed(userId)

        then:
        1 * store.issue(userId, ConfirmationPurpose.NEW_EMAIL, "new@example.com") >> "042517"

        then:
        1 * emailSender.send({ EmailMessage m ->
            m.to == "new@example.com" && m.subject == subject && m.body.contains("042517") && m.body.contains(phrase)
        })

        then:
        1 * store.recordNewEmailCodeSent(userId)
        result.resendAfterSeconds == 60
        result.expiresInSeconds == 900

        where:
        language | subject                                | phrase
        "en"     | "Your SportConnect confirmation code"   | "this email address is yours"
        "vi"     | "Mã xác nhận SportConnect của bạn"      | "địa chỉ email này là của bạn"
    }

    def "sendNewEmailCode over the daily allowance issues and mails nothing"() {
        when:
        service.sendNewEmailCode(userId, "new@example.com", Optional.empty())

        then:
        1 * store.checkNewEmailCodeAllowed(userId) >> { throw new TooManyRequestsException("NEW_EMAIL_CODE_LIMIT_REACHED", "later", [seconds: 3600L]) }
        0 * store.issue(*_)
        0 * emailSender.send(_)
        0 * store.recordNewEmailCodeSent(_)
        def e = thrown(TooManyRequestsException)
        e.errorCode == "NEW_EMAIL_CODE_LIMIT_REACHED"
    }

    def "sendNewEmailCode inside the resend interval mails nothing and does not count"() {
        when:
        service.sendNewEmailCode(userId, "new@example.com", Optional.empty())

        then:
        1 * store.issue(userId, ConfirmationPurpose.NEW_EMAIL, "new@example.com") >> { throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON", "wait", [seconds: 30L]) }
        0 * emailSender.send(_)
        0 * store.recordNewEmailCodeSent(_)
        thrown(TooManyRequestsException)
    }

    def "confirmNewEmail verifies the code for the NEW_EMAIL purpose and that exact address"() {
        when:
        service.confirmNewEmail(userId, "new@example.com", "123456")

        then:
        1 * store.verify(userId, ConfirmationPurpose.NEW_EMAIL, "new@example.com", "123456")
    }

    def "confirmNewEmail passes the store's refusal on"() {
        when:
        service.confirmNewEmail(userId, "other@example.com", "123456")

        then:
        1 * store.verify(userId, ConfirmationPurpose.NEW_EMAIL, "other@example.com", "123456") >> { throw new BadRequestException("VERIFICATION_CODE_EXPIRED", "x", null) }
        thrown(BadRequestException)
    }

    def "the Keycloak half and the clean-up are delegated"() {
        when:
        def taken = service.isEmailRegisteredElsewhere(userId, "new@example.com")
        service.replaceEmailInKeycloak(userId, "new@example.com")
        service.purgeAfterEmailChange(userId)

        then:
        1 * credentials.isEmailRegistered("new@example.com", userId) >> true
        1 * credentials.replaceEmail(userId, "new@example.com")
        1 * store.purgeAfterEmailChange(userId)
        taken
    }
}

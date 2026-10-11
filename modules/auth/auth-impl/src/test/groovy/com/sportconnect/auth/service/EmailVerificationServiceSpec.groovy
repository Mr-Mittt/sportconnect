package com.sportconnect.auth.service

import com.sportconnect.auth.entity.EmailVerification
import com.sportconnect.auth.repository.EmailVerificationRepository
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.email.api.EmailMessage
import com.sportconnect.email.api.EmailSender
import com.sportconnect.user.api.service.UserService
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

/** A8: the verify-email error paths carry registered error codes (message text unchanged). */
class EmailVerificationServiceSpec extends Specification {

    EmailVerificationRepository repository = Mock()
    EmailSender emailSender = Mock()
    EmailMessages emailMessages = new EmailMessages()
    UserService userService = Mock()

    @Subject
    EmailVerificationService service = new EmailVerificationService(repository, emailSender, emailMessages, userService)

    def "an unknown token is a 404 NotFoundException coded VERIFICATION_TOKEN_INVALID"() {
        given:
        repository.findByToken("nope") >> Optional.empty()

        when:
        service.verifyEmail("nope")

        then:
        def e = thrown(NotFoundException)
        e.message == "Invalid verification token"
        e.errorCode == "VERIFICATION_TOKEN_INVALID"
    }

    def "an already verified token is a BadRequestException coded EMAIL_ALREADY_VERIFIED"() {
        given:
        repository.findByToken("t") >> Optional.of(EmailVerification.builder()
                .token("t").expiresAt(LocalDateTime.now().plusHours(1)).verifiedAt(LocalDateTime.now()).build())

        when:
        service.verifyEmail("t")

        then:
        def e = thrown(BadRequestException)
        e.message == "Email already verified"
        e.errorCode == "EMAIL_ALREADY_VERIFIED"
    }

    def "an expired token is a BadRequestException coded VERIFICATION_TOKEN_EXPIRED"() {
        given:
        repository.findByToken("t") >> Optional.of(EmailVerification.builder()
                .token("t").expiresAt(LocalDateTime.now().minusMinutes(1)).build())

        when:
        service.verifyEmail("t")

        then:
        def e = thrown(BadRequestException)
        e.message == "Verification token has expired"
        e.errorCode == "VERIFICATION_TOKEN_EXPIRED"
    }

    // ---------- A13: localised verification and welcome emails ----------

    def "the verification email goes out in the user's language, with the link and the 24 hour validity"() {
        given:
        def userId = UUID.randomUUID()
        service.verificationUrl = "http://x/verify-email"
        userService.findPreferredLanguageCode(userId) >> preferred

        when:
        service.createAndSendVerification(userId, "a@x.com")

        then:
        1 * repository.save({ EmailVerification v -> v.userId == userId && v.expiresAt.isAfter(LocalDateTime.now().plusHours(23)) })
        1 * emailSender.send({ EmailMessage m ->
            m.to == "a@x.com" && m.subject == subject && m.body.contains("http://x/verify-email?token=") &&
                    m.body.contains(validity)
        })

        where:
        preferred          | subject                           | validity
        Optional.of("vi")  | "Xác minh email của bạn - SportConnect" | "24 giờ"
        Optional.of("en")  | "Verify Your Email - SportConnect"      | "24 hours"
        Optional.of("fr")  | "Verify Your Email - SportConnect"      | "24 hours"   // no bundle: English
        Optional.empty()   | "Verify Your Email - SportConnect"      | "24 hours"
    }

    def "the welcome email goes out in the user's language and greets by first name"() {
        given:
        def userId = UUID.randomUUID()
        userService.findPreferredLanguageCode(userId) >> preferred

        when:
        service.sendWelcomeEmail(userId, "a@x.com", firstName)

        then:
        1 * emailSender.send({ EmailMessage m ->
            m.to == "a@x.com" && m.subject == subject && m.body.startsWith(greeting)
        })

        where:
        preferred          | firstName | subject                                 | greeting
        Optional.of("vi")  | "Lan"     | "Chào mừng bạn đến với SportConnect!"   | "Xin chào Lan,"
        Optional.of("vi")  | null      | "Chào mừng bạn đến với SportConnect!"   | "Xin chào bạn,"
        Optional.empty()   | "Sam"     | "Welcome to SportConnect!"              | "Hi Sam,"
        Optional.empty()   | " "       | "Welcome to SportConnect!"              | "Hi there,"
    }
}

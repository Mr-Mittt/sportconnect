package com.sportconnect.auth.service

import com.sportconnect.auth.entity.EmailVerification
import com.sportconnect.auth.repository.EmailVerificationRepository
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

/** A8: the verify-email error paths carry registered error codes (message text unchanged). */
class EmailVerificationServiceSpec extends Specification {

    EmailVerificationRepository repository = Mock()
    EmailService emailService = Mock()

    @Subject
    EmailVerificationService service = new EmailVerificationService(repository, emailService)

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
}

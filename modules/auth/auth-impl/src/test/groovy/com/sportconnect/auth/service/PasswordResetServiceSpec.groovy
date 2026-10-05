package com.sportconnect.auth.service

import com.sportconnect.auth.entity.PasswordResetToken
import com.sportconnect.auth.repository.PasswordResetTokenRepository
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.user.api.service.UserService
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

/** A8: the reset-password error paths carry registered error codes (message text unchanged). */
class PasswordResetServiceSpec extends Specification {

    PasswordResetTokenRepository repository = Mock()
    EmailService emailService = Mock()
    UserService userService = Mock()
    PasswordEncoder passwordEncoder = Mock()

    @Subject
    PasswordResetService service = new PasswordResetService(repository, emailService, userService, passwordEncoder)

    def "an unknown token is a 404 NotFoundException coded RESET_TOKEN_INVALID"() {
        given:
        repository.findByToken("nope") >> Optional.empty()

        when:
        service.validateAndUseToken("nope")

        then:
        def e = thrown(NotFoundException)
        e.message == "Invalid reset token"
        e.errorCode == "RESET_TOKEN_INVALID"
    }

    def "an already used token is a BadRequestException coded RESET_TOKEN_USED"() {
        given:
        repository.findByToken("t") >> Optional.of(PasswordResetToken.builder()
                .token("t").expiresAt(LocalDateTime.now().plusHours(1)).usedAt(LocalDateTime.now()).build())

        when:
        service.validateAndUseToken("t")

        then:
        def e = thrown(BadRequestException)
        e.message == "Reset token already used"
        e.errorCode == "RESET_TOKEN_USED"
    }

    def "an expired token is a BadRequestException coded RESET_TOKEN_EXPIRED"() {
        given:
        repository.findByToken("t") >> Optional.of(PasswordResetToken.builder()
                .token("t").expiresAt(LocalDateTime.now().minusMinutes(1)).build())

        when:
        service.validateAndUseToken("t")

        then:
        def e = thrown(BadRequestException)
        e.message == "Reset token has expired"
        e.errorCode == "RESET_TOKEN_EXPIRED"
    }
}

package com.sportconnect.auth.service

import com.sportconnect.auth.entity.PasswordResetToken
import com.sportconnect.auth.repository.PasswordResetTokenRepository
import com.sportconnect.auth.repository.RefreshTokenRepository
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.user.api.service.UserService
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.transaction.PlatformTransactionManager
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

/**
 * A8: the reset-password error paths carry registered error codes (message text unchanged).
 * A10: requestReset (forgot-password) and the refresh-token revocation on reset.
 */
class PasswordResetServiceSpec extends Specification {

    PasswordResetTokenRepository repository = Mock()
    RefreshTokenRepository refreshTokenRepository = Mock()
    PlatformTransactionManager transactionManager = Mock()
    EmailService emailService = Mock()
    EmailMessages emailMessages = new EmailMessages()
    UserService userService = Mock()
    PasswordEncoder passwordEncoder = Mock()

    @Subject
    PasswordResetService service = new PasswordResetService(repository, refreshTokenRepository, emailService, emailMessages,
            userService, passwordEncoder, transactionManager)

    def setup() {
        service.expirationMinutes = 60
    }

    // ---------- A10: requestReset ----------

    def "a known email gets a fresh token (old one replaced) and the email is sent with that token"() {
        given:
        def userId = UUID.randomUUID()
        userService.findUserIdByEmail("a@x.com") >> Optional.of(userId)
        userService.findPreferredLanguageCode(userId) >> Optional.empty()

        when:
        service.requestReset("a@x.com")

        then:
        1 * repository.deleteByUserId(userId)
        1 * repository.saveAndFlush({ PasswordResetToken t ->
            t.userId == userId && t.token != null && t.expiresAt.isAfter(LocalDateTime.now().plusMinutes(59))
        }) >> { PasswordResetToken t -> t }
        1 * emailService.sendPasswordResetEmail("a@x.com", { it != null }, "en")
    }

    def "the reset email is sent in the user's resolved language: #resolved gives #sent"() {
        given:
        userService.findUserIdByEmail("a@x.com") >> Optional.of(UUID.randomUUID())
        userService.findPreferredLanguageCode(_) >> resolved
        repository.saveAndFlush(_) >> { PasswordResetToken t -> t }

        when:
        service.requestReset("a@x.com")

        then:
        1 * emailService.sendPasswordResetEmail("a@x.com", _, sent)

        where:
        resolved              | sent
        Optional.of("vi")     | "vi"
        Optional.of("vi-VN")  | "vi"
        Optional.of("fr")     | "en"   // active language, but no email bundle
        Optional.empty()      | "en"
    }

    def "an unknown email does nothing: no token, no email, no error"() {
        given:
        userService.findUserIdByEmail("nobody@x.com") >> Optional.empty()

        when:
        service.requestReset("nobody@x.com")

        then:
        noExceptionThrown()
        0 * repository._
        0 * emailService._
    }

    def "losing a concurrent-request race on the unique user_id sends no email and does not throw"() {
        given:
        userService.findUserIdByEmail("a@x.com") >> Optional.of(UUID.randomUUID())
        repository.saveAndFlush(_) >> { throw new DataIntegrityViolationException("uq_password_reset_tokens_user_id") }

        when:
        service.requestReset("a@x.com")

        then:
        noExceptionThrown()
        0 * emailService._
    }

    def "resetting the password also revokes every refresh token of the user"() {
        given:
        def userId = UUID.randomUUID()
        passwordEncoder.encode("new-pass-123") >> "hashed"

        when:
        service.resetPassword(userId, "new-pass-123")

        then:
        1 * userService.updateUserPassword(userId, "hashed")
        1 * refreshTokenRepository.revokeAllUserTokens(userId, _ as LocalDateTime)
    }

    // ---------- A8: error codes ----------

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

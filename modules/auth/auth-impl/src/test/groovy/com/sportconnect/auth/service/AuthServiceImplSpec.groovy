package com.sportconnect.auth.service

import com.sportconnect.auth.api.dto.LoginRequest
import com.sportconnect.auth.api.dto.RegisterRequest
import com.sportconnect.auth.api.service.JwtTokenService
import com.sportconnect.auth.entity.RefreshToken
import com.sportconnect.auth.repository.RefreshTokenRepository
import com.sportconnect.common.exception.UnauthorizedException
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class AuthServiceImplSpec extends Specification {

    RefreshTokenRepository refreshTokenRepository
    PasswordEncoder passwordEncoder
    JwtTokenService jwtTokenService
    
    @Subject
    AuthServiceImpl authService

    def setup() {
        refreshTokenRepository = Mock(RefreshTokenRepository)
        passwordEncoder = Mock(PasswordEncoder)
        jwtTokenService = Mock(JwtTokenService)
        
        authService = new AuthServiceImpl(
            refreshTokenRepository,
            passwordEncoder,
            jwtTokenService
        )
    }

    def "should throw UnsupportedOperationException when registering user"() {
        given: "a registration request"
        def request = RegisterRequest.builder()
            .email("test@example.com")
            .password("password123")
            .firstName("John")
            .lastName("Doe")
            .username("johndoe")
            .build()

        when: "attempting to register"
        authService.register(request)

        then: "should throw UnsupportedOperationException"
        def exception = thrown(UnsupportedOperationException)
        exception.message.contains("Register requires user module integration")
    }

    def "should throw UnsupportedOperationException when logging in"() {
        given: "a login request"
        def request = LoginRequest.builder()
            .email("test@example.com")
            .password("password123")
            .build()

        when: "attempting to login"
        authService.login(request)

        then: "should throw UnsupportedOperationException"
        def exception = thrown(UnsupportedOperationException)
        exception.message.contains("Login requires user module integration")
    }

    def "should throw UnauthorizedException when refresh token is invalid"() {
        given: "an invalid refresh token"
        def invalidToken = "invalid-token"
        
        and: "repository returns empty"
        refreshTokenRepository.findByToken(invalidToken) >> Optional.empty()

        when: "attempting to refresh token"
        authService.refreshToken(invalidToken)

        then: "should throw UnauthorizedException"
        def exception = thrown(UnauthorizedException)
        exception.message == "Invalid refresh token"
    }

    def "should throw UnauthorizedException when refresh token is expired"() {
        given: "an expired refresh token"
        def tokenString = "expired-token"
        def expiredToken = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token(tokenString)
            .expiresAt(LocalDateTime.now().minusDays(1))
            .build()
        
        and: "repository returns expired token"
        refreshTokenRepository.findByToken(tokenString) >> Optional.of(expiredToken)

        when: "attempting to refresh token"
        authService.refreshToken(tokenString)

        then: "should throw UnauthorizedException"
        def exception = thrown(UnauthorizedException)
        exception.message == "Refresh token expired or revoked"
    }

    def "should throw UnauthorizedException when refresh token is revoked"() {
        given: "a revoked refresh token"
        def tokenString = "revoked-token"
        def revokedToken = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token(tokenString)
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(LocalDateTime.now().minusHours(1))
            .build()
        
        and: "repository returns revoked token"
        refreshTokenRepository.findByToken(tokenString) >> Optional.of(revokedToken)

        when: "attempting to refresh token"
        authService.refreshToken(tokenString)

        then: "should throw UnauthorizedException"
        def exception = thrown(UnauthorizedException)
        exception.message == "Refresh token expired or revoked"
    }

    def "should logout user and revoke all tokens"() {
        given: "a user ID"
        def userId = UUID.randomUUID()
        def now = LocalDateTime.now()

        when: "logging out user"
        authService.logout(userId)

        then: "should revoke all user tokens"
        1 * refreshTokenRepository.revokeAllUserTokens(userId, _)
    }

    def "should create refresh token with correct expiration"() {
        given: "user ID and token string"
        def userId = UUID.randomUUID()
        def tokenString = "refresh-token-123"
        def refreshExpiration = 604800000L // 7 days
        
        and: "jwt service returns expiration"
        jwtTokenService.getRefreshExpiration() >> refreshExpiration

        when: "creating refresh token"
        def result = authService.createRefreshToken(userId, tokenString)

        then: "should save token with correct data"
        1 * refreshTokenRepository.save({ RefreshToken token ->
            token.userId == userId &&
            token.token == tokenString &&
            token.expiresAt.isAfter(LocalDateTime.now()) &&
            token.revokedAt == null
        })
        
        and: "should return token string"
        result == tokenString
    }
}

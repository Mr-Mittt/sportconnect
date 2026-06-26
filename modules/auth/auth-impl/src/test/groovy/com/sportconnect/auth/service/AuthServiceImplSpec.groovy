package com.sportconnect.auth.service

import com.sportconnect.auth.api.dto.LoginRequest
import com.sportconnect.auth.api.dto.RegisterRequest
import com.sportconnect.auth.api.service.JwtTokenService
import com.sportconnect.auth.config.JwtProperties
import com.sportconnect.auth.entity.RefreshToken
import com.sportconnect.auth.repository.EmailVerificationRepository
import com.sportconnect.auth.repository.PasswordResetTokenRepository
import com.sportconnect.auth.repository.RefreshTokenRepository
import com.sportconnect.common.exception.UnauthorizedException
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime
import java.util.HashSet

class AuthServiceImplSpec extends Specification {

    RefreshTokenRepository refreshTokenRepository
    PasswordEncoder passwordEncoder
    JwtTokenService jwtTokenService
    EmailService emailService
    EmailVerificationRepository emailVerificationRepository
    PasswordResetTokenRepository passwordResetTokenRepository
    UserService userService
    JwtProperties jwtProperties

    @Subject
    AuthServiceImpl authService

    def setup() {
        refreshTokenRepository = Mock(RefreshTokenRepository)
        passwordEncoder = Mock(PasswordEncoder)
        jwtTokenService = Mock(JwtTokenService)
        emailService = Mock(EmailService)
        emailVerificationRepository = Mock(EmailVerificationRepository)
        passwordResetTokenRepository = Mock(PasswordResetTokenRepository)
        userService = Mock(UserService)
        jwtProperties = Mock(JwtProperties)

        authService = new AuthServiceImpl(
            refreshTokenRepository,
            passwordEncoder,
            jwtTokenService,
            emailService,
            emailVerificationRepository,
            passwordResetTokenRepository,
            userService,
            jwtProperties
        )
    }

    def "should register user successfully"() {
        given: "a registration request"
        def request = RegisterRequest.builder()
            .email("test@example.com")
            .password("password123")
            .fullName("John Doe")
            .phoneNumber("1234567890")
            .build()

        and: "email doesn't exist"
        userService.existsByEmail(request.email) >> false

        and: "password encoder encodes password"
        passwordEncoder.encode(request.password) >> "encoded-password"

        and: "user service creates user"
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> UUID.randomUUID()
        userResponse.getEmail() >> request.email
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getUsername() >> null
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        userService.createUser(_, _, _, _, _) >> userResponse

        and: "jwt service generates tokens"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when: "registering user"
        def result = authService.register(request)

        then: "should return auth response"
        result != null
        result.accessToken == "access-token"
        result.refreshToken == "refresh-token"
        1 * refreshTokenRepository.save(_)
    }

    def "should login user successfully"() {
        given: "a login request"
        def request = LoginRequest.builder()
            .email("test@example.com")
            .password("password123")
            .build()

        and: "password verification succeeds"
        userService.verifyPassword(request.email, request.password) >> true

        and: "user service returns user"
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> UUID.randomUUID()
        userResponse.getEmail() >> request.email
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getUsername() >> null
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        userService.getUserByEmail(request.email) >> userResponse

        and: "jwt service generates tokens"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when: "logging in"
        def result = authService.login(request)

        then: "should return auth response"
        result != null
        result.accessToken == "access-token"
        result.refreshToken == "refresh-token"
        1 * userService.updateLastLogin(_)
        1 * refreshTokenRepository.save(_)
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

    def "should refresh token successfully"() {
        given: "a valid refresh token"
        def tokenString = "valid-token"
        def userId = UUID.randomUUID()
        def validToken = RefreshToken.builder()
            .id(1L)
            .userId(userId)
            .token(tokenString)
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build()

        and: "repository returns valid token"
        refreshTokenRepository.findByToken(tokenString) >> Optional.of(validToken)

        and: "user service returns user"
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> userId
        userResponse.getEmail() >> "test@example.com"
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getUsername() >> null
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        userService.getUserById(userId) >> userResponse

        and: "jwt service generates tokens"
        jwtTokenService.generateAccessToken(_) >> "new-access-token"
        jwtTokenService.generateRefreshToken(_) >> "new-refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when: "refreshing token"
        def result = authService.refreshToken(tokenString)

        then: "should return new auth response"
        result != null
        result.accessToken == "new-access-token"
        result.refreshToken == "new-refresh-token"
        2 * refreshTokenRepository.save(_) // One to revoke old token, one to save new token
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

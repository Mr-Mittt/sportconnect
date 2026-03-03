package com.sportconnect.auth.service

import com.sportconnect.auth.config.JwtProperties
import spock.lang.Specification
import spock.lang.Subject

class JwtTokenServiceImplSpec extends Specification {

    JwtProperties jwtProperties
    
    @Subject
    JwtTokenServiceImpl jwtTokenService

    def setup() {
        jwtProperties = new JwtProperties()
        jwtProperties.secret = "test-secret-key-for-jwt-token-generation-minimum-256-bits-required-for-hmac-sha"
        jwtProperties.expiration = 3600000L // 1 hour
        jwtProperties.refreshExpiration = 604800000L // 7 days
        
        jwtTokenService = new JwtTokenServiceImpl(jwtProperties)
    }

    def "should generate access token for user"() {
        given: "a user data map"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]

        when: "generating access token"
        def token = jwtTokenService.generateAccessToken(userData)

        then: "token should be generated"
        token != null
        token.length() > 0
    }

    def "should generate refresh token for user"() {
        given: "a user data map"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]

        when: "generating refresh token"
        def token = jwtTokenService.generateRefreshToken(userData)

        then: "token should be generated"
        token != null
        token.length() > 0
    }

    def "should validate valid token"() {
        given: "a valid token"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]
        def token = jwtTokenService.generateAccessToken(userData)

        when: "validating the token"
        def isValid = jwtTokenService.validateToken(token)

        then: "token should be valid"
        isValid == true
    }

    def "should reject invalid token"() {
        given: "an invalid token"
        def invalidToken = "invalid.token.here"

        when: "validating the token"
        def isValid = jwtTokenService.validateToken(invalidToken)

        then: "token should be invalid"
        isValid == false
    }

    def "should extract user ID from token"() {
        given: "a token with user data"
        def userId = UUID.randomUUID()
        def userData = [
            id: userId,
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]
        def token = jwtTokenService.generateAccessToken(userData)

        when: "extracting user ID"
        def extractedUserId = jwtTokenService.getUserIdFromToken(token)

        then: "should return correct user ID"
        extractedUserId == userId.toString()
    }

    def "should extract email from token"() {
        given: "a token with user data"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]
        def token = jwtTokenService.generateAccessToken(userData)

        when: "extracting email"
        def email = jwtTokenService.getEmailFromToken(token)

        then: "should return correct email"
        email == "test@example.com"
    }

    def "should extract authorities from token"() {
        given: "a token with roles"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER", "ADMIN"]
        ]
        def token = jwtTokenService.generateAccessToken(userData)

        when: "extracting authorities"
        def authorities = jwtTokenService.getAuthoritiesFromToken(token)

        then: "should return correct roles"
        authorities.size() == 2
        authorities.contains("USER")
        authorities.contains("ADMIN")
    }

    def "should detect expired token"() {
        given: "a token with very short expiration"
        jwtProperties.expiration = 1L // 1 millisecond
        def shortLivedService = new JwtTokenServiceImpl(jwtProperties)
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: ["USER"]
        ]
        def token = shortLivedService.generateAccessToken(userData)
        
        and: "wait for token to expire"
        Thread.sleep(10)

        when: "checking if token is expired"
        def isExpired = shortLivedService.isTokenExpired(token)

        then: "token should be expired"
        isExpired == true
    }

    def "should return refresh expiration time"() {
        when: "getting refresh expiration"
        def expiration = jwtTokenService.getRefreshExpiration()

        then: "should return configured value"
        expiration == 604800000L
    }

    def "should handle token with missing claims gracefully"() {
        given: "a token"
        def userData = [
            id: UUID.randomUUID(),
            email: "test@example.com",
            username: "testuser",
            roles: []
        ]
        def token = jwtTokenService.generateAccessToken(userData)

        when: "extracting authorities from token with empty roles"
        def authorities = jwtTokenService.getAuthoritiesFromToken(token)

        then: "should return empty list"
        authorities.isEmpty()
    }
}

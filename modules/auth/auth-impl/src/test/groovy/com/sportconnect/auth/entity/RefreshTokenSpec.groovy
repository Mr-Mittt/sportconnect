package com.sportconnect.auth.entity

import spock.lang.Specification

import java.time.LocalDateTime

class RefreshTokenSpec extends Specification {

    def "should detect expired token"() {
        given: "a refresh token that expired yesterday"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().minusDays(1))
            .build()

        when: "checking if expired"
        def isExpired = token.isExpired()

        then: "should return true"
        isExpired == true
    }

    def "should detect non-expired token"() {
        given: "a refresh token that expires tomorrow"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(1))
            .build()

        when: "checking if expired"
        def isExpired = token.isExpired()

        then: "should return false"
        isExpired == false
    }

    def "should detect revoked token"() {
        given: "a revoked refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(LocalDateTime.now().minusHours(1))
            .build()

        when: "checking if revoked"
        def isRevoked = token.isRevoked()

        then: "should return true"
        isRevoked == true
    }

    def "should detect non-revoked token"() {
        given: "a non-revoked refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(null)
            .build()

        when: "checking if revoked"
        def isRevoked = token.isRevoked()

        then: "should return false"
        isRevoked == false
    }

    def "should detect valid token"() {
        given: "a valid refresh token (not expired, not revoked)"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(null)
            .build()

        when: "checking if valid"
        def isValid = token.isValid()

        then: "should return true"
        isValid == true
    }

    def "should detect invalid token when expired"() {
        given: "an expired refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().minusDays(1))
            .revokedAt(null)
            .build()

        when: "checking if valid"
        def isValid = token.isValid()

        then: "should return false"
        isValid == false
    }

    def "should detect invalid token when revoked"() {
        given: "a revoked refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(LocalDateTime.now().minusHours(1))
            .build()

        when: "checking if valid"
        def isValid = token.isValid()

        then: "should return false"
        isValid == false
    }

    def "should set token as revoked"() {
        given: "a valid refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(null)
            .build()

        when: "setting token as revoked"
        token.setRevoked(true)

        then: "revokedAt should be set"
        token.revokedAt != null
        token.isRevoked() == true
        token.isValid() == false
    }

    def "should unset token revocation"() {
        given: "a revoked refresh token"
        def token = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("test-token")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .revokedAt(LocalDateTime.now().minusHours(1))
            .build()

        when: "unsetting revocation"
        token.setRevoked(false)

        then: "revokedAt should be null"
        token.revokedAt == null
        token.isRevoked() == false
        token.isValid() == true
    }

    def "should implement equals correctly"() {
        given: "two tokens with same ID"
        def id = 1L
        def token1 = RefreshToken.builder()
            .id(id)
            .userId(UUID.randomUUID())
            .token("token1")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build()
        
        def token2 = RefreshToken.builder()
            .id(id)
            .userId(UUID.randomUUID())
            .token("token2")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build()

        expect: "tokens should be equal"
        token1.equals(token2) == true
    }

    def "should implement equals correctly for different IDs"() {
        given: "two tokens with different IDs"
        def token1 = RefreshToken.builder()
            .id(1L)
            .userId(UUID.randomUUID())
            .token("token1")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build()
        
        def token2 = RefreshToken.builder()
            .id(2L)
            .userId(UUID.randomUUID())
            .token("token2")
            .expiresAt(LocalDateTime.now().plusDays(7))
            .build()

        expect: "tokens should not be equal"
        token1.equals(token2) == false
    }
}

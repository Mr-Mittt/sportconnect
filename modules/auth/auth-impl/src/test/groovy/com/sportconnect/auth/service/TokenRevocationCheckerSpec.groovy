package com.sportconnect.auth.service

import com.sportconnect.auth.config.JwtProperties
import com.sportconnect.auth.repository.RefreshTokenRepository
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * U12: cache-aside deny-list lookup. RefreshTokenRepository is the durable source of truth
 * (revokeAllUserTokens already writes it); Redis here is purely a read-through cache in front of
 * it, so every "cache miss" case below is also the "Redis lost its data entirely" case.
 */
class TokenRevocationCheckerSpec extends Specification {

    StringRedisTemplate stringRedisTemplate = Mock()
    ValueOperations valueOps = Mock()
    RefreshTokenRepository refreshTokenRepository = Mock()
    JwtProperties jwtProperties = new JwtProperties(expiration: 3600000L)

    @Subject
    TokenRevocationChecker checker = new TokenRevocationChecker(stringRedisTemplate, refreshTokenRepository, jwtProperties)

    def setup() {
        stringRedisTemplate.opsForValue() >> valueOps
    }

    def "isRevoked returns false on a cache hit for a never-revoked user"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> ""

        when:
        def result = checker.isRevoked(userId, Instant.now())

        then:
        !result

        and: "the DB fallback is never consulted on a cache hit"
        0 * refreshTokenRepository.findLatestRevocationTimestamp(_)
    }

    def "isRevoked compares issuedAt against a cached watermark"() {
        given:
        def userId = UUID.randomUUID()
        def revokedAt = Instant.now()
        valueOps.get("auth:revoked-before:" + userId) >> String.valueOf(revokedAt.toEpochMilli())

        when:
        def result = checker.isRevoked(userId, issuedAt)

        then:
        result == expected

        where:
        issuedAt                       | expected
        Instant.now().minusSeconds(60) | true   // issued before revocation
        Instant.ofEpochMilli(0)        | true   // well before revocation
        Instant.now().plusSeconds(60)  | false  // issued after revocation (fresh login)
    }

    def "isRevoked falls back to the DB on a cache miss and repopulates Redis"() {
        given: "Redis has nothing cached — including the 'Redis lost its data' scenario"
        def userId = UUID.randomUUID()
        def revokedAtLocal = LocalDateTime.now().minusMinutes(1)
        def revokedAtInstant = revokedAtLocal.atZone(ZoneId.systemDefault()).toInstant()
        valueOps.get("auth:revoked-before:" + userId) >> null
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> revokedAtLocal

        when: "an access token issued before that revocation is checked"
        def result = checker.isRevoked(userId, Instant.now().minusSeconds(300))

        then: "correctly rejects, sourced from the durable Postgres value, not Redis"
        result

        and: "caches the resolved watermark with a TTL matching the access-token lifetime"
        1 * valueOps.set("auth:revoked-before:" + userId,
                String.valueOf(revokedAtInstant.toEpochMilli()),
                Duration.ofMillis(3600000L))
    }

    def "isRevoked falls back to the DB and caches the never-revoked sentinel when nothing was ever revoked"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> null
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> null

        when:
        def result = checker.isRevoked(userId, Instant.now())

        then:
        !result

        and: "caches the sentinel so the next request for this user hits the cache, not Postgres"
        1 * valueOps.set("auth:revoked-before:" + userId, "", Duration.ofMillis(3600000L))
    }
}

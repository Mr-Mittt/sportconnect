package com.sportconnect.auth.service

import com.sportconnect.auth.config.JwtProperties
import com.sportconnect.auth.repository.RefreshTokenRepository
import com.sportconnect.common.cache.CacheGuard
import org.springframework.data.redis.RedisConnectionFailureException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

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
    TokenRevocationChecker checker = new TokenRevocationChecker(stringRedisTemplate, new CacheGuard(), refreshTokenRepository, jwtProperties)

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

        and: "caches the sentinel for the short A12 TTL (not the access-token lifetime) so a stale one self-heals"
        1 * valueOps.set("auth:revoked-before:" + userId, "", Duration.ofMillis(5000L))
    }

    // ---------- A11: Redis outage ----------

    def "when Redis is down the watermark comes from the DB: a token issued before a revocation is still rejected"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> { throw new RedisConnectionFailureException("Unable to connect to Redis") }
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> LocalDateTime.now().minusMinutes(1)

        expect:
        checker.isRevoked(userId, Instant.now().minusSeconds(300))
        !checker.isRevoked(userId, Instant.now().plusSeconds(60))
    }

    def "when Redis is down a never-revoked user is let through, and no write-back is attempted"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> { throw new RedisConnectionFailureException("Unable to connect to Redis") }
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> null

        when:
        def result = checker.isRevoked(userId, Instant.now())

        then:
        !result
        0 * valueOps.set(*_)
    }

    def "when only the cache write-back fails the request still answers correctly from the DB"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> null
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> LocalDateTime.now().minusMinutes(1)
        valueOps.set(*_) >> { throw new RedisConnectionFailureException("Connection reset") }

        expect:
        checker.isRevoked(userId, Instant.now().minusSeconds(300))
    }

    def "a failure that is not a Redis outage is not swallowed"() {
        given:
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> { throw new IllegalStateException("bug") }

        when:
        checker.isRevoked(userId, Instant.now())

        then:
        thrown(IllegalStateException)
    }

    // ---------- A12: eviction on revoke ----------

    def "the sentinel TTL follows app.jwt.revocation-sentinel-ttl"() {
        given:
        jwtProperties.revocationSentinelTtl = 1500L
        def userId = UUID.randomUUID()
        valueOps.get("auth:revoked-before:" + userId) >> null
        refreshTokenRepository.findLatestRevocationTimestamp(userId) >> null

        when:
        checker.isRevoked(userId, Instant.now())

        then:
        1 * valueOps.set("auth:revoked-before:" + userId, "", Duration.ofMillis(1500L))
    }

    def "evict deletes the user's watermark key"() {
        given:
        def userId = UUID.randomUUID()

        when:
        checker.evict(userId)

        then:
        1 * stringRedisTemplate.delete("auth:revoked-before:" + userId)
    }

    def "a Redis failure while evicting is swallowed"() {
        given:
        def userId = UUID.randomUUID()
        stringRedisTemplate.delete(_ as String) >> { throw new RedisConnectionFailureException("Unable to connect to Redis") }

        when:
        checker.evict(userId)

        then:
        noExceptionThrown()
    }

    def "evictAfterCommit evicts immediately when there is no transaction"() {
        given:
        def userId = UUID.randomUUID()

        when:
        checker.evictAfterCommit(userId)

        then:
        1 * stringRedisTemplate.delete("auth:revoked-before:" + userId)
    }

    def "evictAfterCommit waits for the commit, and does not evict on rollback"() {
        given:
        def userId = UUID.randomUUID()
        TransactionSynchronizationManager.initSynchronization()

        when: "called inside a transaction"
        checker.evictAfterCommit(userId)

        then: "nothing is evicted yet"
        0 * stringRedisTemplate.delete(_ as String)

        when: "the transaction commits"
        TransactionSynchronizationManager.getSynchronizations().each { it.afterCommit() }

        then:
        1 * stringRedisTemplate.delete("auth:revoked-before:" + userId)

        cleanup:
        TransactionSynchronizationManager.clearSynchronization()
    }

    def "a rolled-back transaction never evicts"() {
        given:
        def userId = UUID.randomUUID()
        TransactionSynchronizationManager.initSynchronization()
        checker.evictAfterCommit(userId)

        when:
        TransactionSynchronizationManager.getSynchronizations().each { it.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK) }

        then:
        0 * stringRedisTemplate.delete(_ as String)

        cleanup:
        TransactionSynchronizationManager.clearSynchronization()
    }
}

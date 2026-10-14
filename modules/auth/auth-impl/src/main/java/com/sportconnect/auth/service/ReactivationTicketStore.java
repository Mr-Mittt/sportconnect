package com.sportconnect.auth.service;

import com.sportconnect.common.exception.ServiceUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * A26: the server-held {@code reactivationTicket}. When a password user signs in to a deactivated account, the Keycloak
 * session is already open but the app must not use it until the user confirms; the refresh token of that session waits
 * here, behind a random ticket the client sends back to {@code /reactivate} (confirm) or {@code /reactivate/cancel}.
 *
 * <p>Unlike {@code UserAccessStateCache}, this is <strong>state, not a cache</strong>: there is no database copy to fall
 * back to, so a Redis outage cannot be degraded around. {@link #issue} then fails with
 * {@link ServiceUnavailableException} (the caller ends the Keycloak session and answers a retryable 503) and
 * {@link #consume} likewise. This is a known gap, tracked as auth A30.
 *
 * <p>The ticket is 256 random bits; Redis keeps only its SHA-256, so reading the keyspace does not yield a usable ticket.
 * It lives {@code app.auth.reactivation-ticket-ttl} (5 minutes) and can be consumed once.
 */
@Component
class ReactivationTicketStore {

    private static final String KEY_PREFIX = "auth:reactivation-ticket:";

    private final StringRedisTemplate redis;
    private final Duration ttl;
    private final SecureRandom random = new SecureRandom();

    ReactivationTicketStore(StringRedisTemplate redis, @Value("${app.auth.reactivation-ticket-ttl:5m}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    /** What a ticket stands for: the deactivated account and the still-parked Keycloak refresh token. */
    record Ticket(UUID userId, String refreshToken) {
    }

    /**
     * Parks the refresh token and returns the ticket that releases it.
     *
     * @throws ServiceUnavailableException if Redis cannot store it
     */
    String issue(UUID userId, String refreshToken) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        try {
            redis.opsForValue().set(key(ticket), userId + "|" + refreshToken, ttl);
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The re-activation ticket could not be stored", e);
        }
        return ticket;
    }

    /**
     * Takes the ticket out of the store (atomically, so two concurrent confirms cannot both win).
     *
     * @return the ticket's content, or empty when it is unknown, expired, already used or malformed
     * @throws ServiceUnavailableException if Redis cannot be read
     */
    Optional<Ticket> consume(String ticket) {
        if (ticket == null || ticket.isBlank()) {
            return Optional.empty();
        }
        String value;
        try {
            value = redis.opsForValue().getAndDelete(key(ticket));
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The re-activation ticket could not be read", e);
        }
        if (value == null) {
            return Optional.empty();
        }
        int bar = value.indexOf('|');
        if (bar <= 0) {
            return Optional.empty();
        }
        try {
            return Optional.of(new Ticket(UUID.fromString(value.substring(0, bar)), value.substring(bar + 1)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static String key(String ticket) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(ticket.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

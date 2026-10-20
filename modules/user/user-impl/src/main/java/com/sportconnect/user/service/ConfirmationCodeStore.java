package com.sportconnect.user.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ServiceUnavailableException;
import com.sportconnect.common.exception.TooManyRequestsException;
import com.sportconnect.user.api.dto.ConfirmationPurpose;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * U24: the one-time codes emailed to confirm a deactivation or a password change, and the allowance of wrong attempts.
 *
 * <p>Like {@code ReactivationTicketStore} (A26) this is <strong>state, not a cache</strong>: a Redis outage cannot be
 * degraded around, so every call fails with {@link ServiceUnavailableException} (a retryable 503) and nothing is
 * confirmed. A code is 6 digits, bound to the user and the purpose; Redis keeps only a SHA-256 of
 * {@code user:purpose:code}, lives {@code app.user.confirmation-code-ttl} (15 minutes) and dies on the first success.
 * A new code replaces the old one and resets the attempts, but only once per {@code resend-interval} (60 seconds). After
 * {@code max-attempts} wrong tries the code is burned.
 *
 * <p>The same class guards the typed-password path: {@link #checkPasswordAllowed} and {@link #recordPasswordFailure}
 * keep a per-user failure count so the backend stops asking Keycloak (whose brute-force detection would otherwise lock
 * the real account) after {@code password-max-attempts} failures in {@code password-attempt-window}.
 */
@Component
class ConfirmationCodeStore {

    private static final String PREFIX = "user:confirm:";
    private static final int CODE_DIGITS = 6;

    private final StringRedisTemplate redis;
    private final Duration ttl;
    private final Duration resendInterval;
    private final int maxAttempts;
    private final Duration passwordWindow;
    private final int passwordMaxAttempts;
    private final SecureRandom random = new SecureRandom();

    ConfirmationCodeStore(StringRedisTemplate redis,
                          @Value("${app.user.confirmation-code-ttl:15m}") Duration ttl,
                          @Value("${app.user.confirmation-resend-interval:60s}") Duration resendInterval,
                          @Value("${app.user.confirmation-max-attempts:5}") int maxAttempts,
                          @Value("${app.user.password-attempt-window:15m}") Duration passwordWindow,
                          @Value("${app.user.password-max-attempts:5}") int passwordMaxAttempts) {
        this.redis = redis;
        this.ttl = ttl;
        this.resendInterval = resendInterval;
        this.maxAttempts = maxAttempts;
        this.passwordWindow = passwordWindow;
        this.passwordMaxAttempts = passwordMaxAttempts;
    }

    Duration ttl() {
        return ttl;
    }

    Duration resendInterval() {
        return resendInterval;
    }

    /**
     * Creates a code for {@code userId} and {@code purpose}, replacing any pending one.
     *
     * @throws TooManyRequestsException {@code VERIFICATION_RESEND_TOO_SOON} when a code was issued less than the resend interval ago
     * @throws ServiceUnavailableException if Redis cannot be used
     */
    String issue(UUID userId, ConfirmationPurpose purpose) {
        try {
            String resendKey = key("resend", userId, purpose);
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(resendKey, "1", resendInterval))) {
                Long left = redis.getExpire(resendKey, TimeUnit.SECONDS);
                throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON",
                        "A code was sent a moment ago; wait before asking for another",
                        Map.of("seconds", Math.max(1L, left == null ? 1L : left)));
            }
            String code = String.format("%0" + CODE_DIGITS + "d", random.nextInt((int) Math.pow(10, CODE_DIGITS)));
            redis.opsForValue().set(key("code", userId, purpose), digest(userId, purpose, code), ttl);
            redis.delete(key("attempts", userId, purpose));
            return code;
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The confirmation code could not be stored", e);
        }
    }

    /**
     * A33: takes the user's slot for one verification email; another within the resend interval is refused. Not tied to a
     * code: the mail and its link are Keycloak's.
     *
     * @throws TooManyRequestsException {@code VERIFICATION_RESEND_TOO_SOON} when one was requested less than the resend interval ago
     * @throws ServiceUnavailableException if Redis cannot be used
     */
    void claimEmailVerificationSlot(UUID userId) {
        try {
            String key = key("email-verify-resend", userId, null);
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, "1", resendInterval))) {
                Long left = redis.getExpire(key, TimeUnit.SECONDS);
                throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON",
                        "A verification email was sent a moment ago; wait before asking for another",
                        Map.of("seconds", Math.max(1L, left == null ? 1L : left)));
            }
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The verification email could not be rate limited", e);
        }
    }

    /** A33: gives the slot back when the mail could not be requested, so a failed send does not cost the user a wait. */
    void releaseEmailVerificationSlot(UUID userId) {
        try {
            redis.delete(key("email-verify-resend", userId, null));
        } catch (DataAccessException e) {
            // best effort: the slot expires by itself
        }
    }

    /**
     * Checks {@code code} and, when it is right, consumes it (a code works once, even if two requests race).
     *
     * @throws BadRequestException {@code VERIFICATION_CODE_EXPIRED} (none pending, expired or already used),
     *         {@code VERIFICATION_CODE_INVALID} (wrong), {@code VERIFICATION_CODE_ATTEMPTS_EXCEEDED} (the last allowed
     *         wrong try; the code is burned)
     * @throws ServiceUnavailableException if Redis cannot be used
     */
    void verify(UUID userId, ConfirmationPurpose purpose, String code) {
        try {
            String codeKey = key("code", userId, purpose);
            String attemptsKey = key("attempts", userId, purpose);
            String stored = redis.opsForValue().get(codeKey);
            if (stored == null) {
                throw new BadRequestException("VERIFICATION_CODE_EXPIRED", "The code has expired; request a new one", null);
            }
            String presented = digest(userId, purpose, code == null ? "" : code.replaceAll("\\s+", ""));
            if (MessageDigest.isEqual(stored.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8))) {
                // delete() reports whether this call removed it, so only one of two racing requests wins.
                if (!Boolean.TRUE.equals(redis.delete(codeKey))) {
                    throw new BadRequestException("VERIFICATION_CODE_EXPIRED", "The code has expired; request a new one", null);
                }
                redis.delete(attemptsKey);
                return;
            }
            Long attempts = redis.opsForValue().increment(attemptsKey);
            redis.expire(attemptsKey, ttl);
            if (attempts != null && attempts >= maxAttempts) {
                redis.delete(codeKey);
                redis.delete(attemptsKey);
                throw new BadRequestException("VERIFICATION_CODE_ATTEMPTS_EXCEEDED",
                        "Too many wrong codes; request a new one", null);
            }
            throw new BadRequestException("VERIFICATION_CODE_INVALID", "The code is not correct", null);
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The confirmation code could not be checked", e);
        }
    }

    /**
     * Refuses a password check while the user is over the failure allowance.
     *
     * @throws TooManyRequestsException {@code PASSWORD_ATTEMPTS_EXCEEDED} ({@code seconds} until the window frees)
     */
    void checkPasswordAllowed(UUID userId) {
        try {
            String key = key("pw-fail", userId, null);
            String failures = redis.opsForValue().get(key);
            if (failures != null && Integer.parseInt(failures) >= passwordMaxAttempts) {
                Long left = redis.getExpire(key, TimeUnit.SECONDS);
                throw new TooManyRequestsException("PASSWORD_ATTEMPTS_EXCEEDED",
                        "Too many wrong passwords; try again later",
                        Map.of("seconds", Math.max(1L, left == null ? 1L : left)));
            }
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The password attempts could not be read", e);
        }
    }

    void recordPasswordFailure(UUID userId) {
        try {
            String key = key("pw-fail", userId, null);
            Long failures = redis.opsForValue().increment(key);
            if (failures != null && failures == 1L) {
                redis.expire(key, passwordWindow);
            }
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The password attempts could not be stored", e);
        }
    }

    void clearPasswordFailures(UUID userId) {
        try {
            redis.delete(key("pw-fail", userId, null));
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The password attempts could not be cleared", e);
        }
    }

    private static String key(String kind, UUID userId, ConfirmationPurpose purpose) {
        return PREFIX + kind + ":" + (purpose == null ? "" : purpose.name() + ":") + userId;
    }

    private static String digest(UUID userId, ConfirmationPurpose purpose, String code) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest((userId + ":" + purpose.name() + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

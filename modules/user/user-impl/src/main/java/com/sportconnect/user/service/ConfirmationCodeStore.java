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
    private final int newEmailDailyLimit;
    private final SecureRandom random = new SecureRandom();

    ConfirmationCodeStore(StringRedisTemplate redis,
                          @Value("${app.user.confirmation-code-ttl:15m}") Duration ttl,
                          @Value("${app.user.confirmation-resend-interval:60s}") Duration resendInterval,
                          @Value("${app.user.confirmation-max-attempts:5}") int maxAttempts,
                          @Value("${app.user.password-attempt-window:15m}") Duration passwordWindow,
                          @Value("${app.user.password-max-attempts:5}") int passwordMaxAttempts,
                          @Value("${app.user.new-email-daily-limit:10}") int newEmailDailyLimit) {
        this.redis = redis;
        this.ttl = ttl;
        this.resendInterval = resendInterval;
        this.maxAttempts = maxAttempts;
        this.passwordWindow = passwordWindow;
        this.passwordMaxAttempts = passwordMaxAttempts;
        this.newEmailDailyLimit = newEmailDailyLimit;
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
        return issue(userId, purpose, null);
    }

    /**
     * Same as {@link #issue(UUID, ConfirmationPurpose)}, with the code also bound to {@code binding} (U26: the exact address a
     * {@code NEW_EMAIL} code is mailed to, so it cannot confirm a different address).
     */
    String issue(UUID userId, ConfirmationPurpose purpose, String binding) {
        try {
            String resendKey = key("resend", userId, purpose);
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(resendKey, "1", resendInterval))) {
                Long left = redis.getExpire(resendKey, TimeUnit.SECONDS);
                throw new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON",
                        "A code was sent a moment ago; wait before asking for another",
                        Map.of("seconds", Math.max(1L, left == null ? 1L : left)));
            }
            String code = String.format("%0" + CODE_DIGITS + "d", random.nextInt((int) Math.pow(10, CODE_DIGITS)));
            redis.opsForValue().set(key("code", userId, purpose), digest(userId, purpose, binding, code), ttl);
            redis.delete(key("attempts", userId, purpose));
            return code;
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The confirmation code could not be stored", e);
        }
    }

    /**
     * U26: refuses another new-address code once the user has asked for {@code app.user.new-email-daily-limit} today. It
     * mails an address the caller names, so it is capped per user per day on top of the resend interval.
     *
     * @throws TooManyRequestsException {@code NEW_EMAIL_CODE_LIMIT_REACHED} ({@code seconds} until the day window frees)
     * @throws ServiceUnavailableException if Redis cannot be used
     */
    void checkNewEmailCodeAllowed(UUID userId) {
        try {
            String key = key("new-email-day", userId, null);
            String sent = redis.opsForValue().get(key);
            if (sent != null && Integer.parseInt(sent) >= newEmailDailyLimit) {
                Long left = redis.getExpire(key, TimeUnit.SECONDS);
                throw new TooManyRequestsException("NEW_EMAIL_CODE_LIMIT_REACHED",
                        "Too many codes were requested today; try again later",
                        Map.of("seconds", Math.max(1L, left == null ? 1L : left)));
            }
        } catch (DataAccessException e) {
            throw new ServiceUnavailableException("The new-email code allowance could not be read", e);
        }
    }

    /** U26: counts one new-address code sent today (the window starts at the first one and lasts 24 hours). */
    void recordNewEmailCodeSent(UUID userId) {
        try {
            String key = key("new-email-day", userId, null);
            Long sent = redis.opsForValue().increment(key);
            if (sent != null && sent == 1L) {
                redis.expire(key, Duration.ofDays(1));
            }
        } catch (DataAccessException e) {
            // best effort: the cap is an abuse limit, not a security check
        }
    }

    /**
     * U26: drops everything pending for the user after an email change: the codes and wrong-try counters of every purpose
     * (a code mailed to the old address must not stay usable) and the verification-mail cooldown (the new address may be
     * verified at once). Best effort; each key also expires by itself.
     */
    void purgeAfterEmailChange(UUID userId) {
        try {
            for (ConfirmationPurpose purpose : ConfirmationPurpose.values()) {
                redis.delete(key("code", userId, purpose));
                redis.delete(key("attempts", userId, purpose));
            }
            redis.delete(key("email-verify-resend", userId, null));
        } catch (DataAccessException e) {
            // best effort
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
        verify(userId, purpose, null, code);
    }

    /** Same as {@link #verify(UUID, ConfirmationPurpose, String)} for a code issued with the same {@code binding}. */
    void verify(UUID userId, ConfirmationPurpose purpose, String binding, String code) {
        verify(userId, purpose, binding, code, true);
    }

    /**
     * U26: the same checks as {@link #verify(UUID, ConfirmationPurpose, String, String)} (a wrong code still counts toward the
     * attempts), but a right code stays usable. An email change checks both of its codes first and spends them only once
     * Keycloak has accepted the change, so a later refusal does not cost the user the code they typed correctly.
     */
    void check(UUID userId, ConfirmationPurpose purpose, String binding, String code) {
        verify(userId, purpose, binding, code, false);
    }

    /** U26: drops the pending code and the wrong-try counter of one purpose (e.g. a new-address code for an address that turned out taken). */
    void discard(UUID userId, ConfirmationPurpose purpose) {
        try {
            redis.delete(key("code", userId, purpose));
            redis.delete(key("attempts", userId, purpose));
        } catch (DataAccessException e) {
            // best effort: the code expires by itself
        }
    }

    private void verify(UUID userId, ConfirmationPurpose purpose, String binding, String code, boolean consume) {
        // ACCOUNT-7: an email change takes two codes and answers both failures with the same code, so the params say which one.
        Map<String, Object> whichCode = Map.of("purpose", purpose.name());
        try {
            String codeKey = key("code", userId, purpose);
            String attemptsKey = key("attempts", userId, purpose);
            String stored = redis.opsForValue().get(codeKey);
            if (stored == null) {
                throw new BadRequestException("VERIFICATION_CODE_EXPIRED", "The code has expired; request a new one", whichCode);
            }
            String presented = digest(userId, purpose, binding, code == null ? "" : code.replaceAll("\\s+", ""));
            if (MessageDigest.isEqual(stored.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8))) {
                if (!consume) {
                    return;
                }
                // delete() reports whether this call removed it, so only one of two racing requests wins.
                if (!Boolean.TRUE.equals(redis.delete(codeKey))) {
                    throw new BadRequestException("VERIFICATION_CODE_EXPIRED", "The code has expired; request a new one", whichCode);
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
                        "Too many wrong codes; request a new one", whichCode);
            }
            throw new BadRequestException("VERIFICATION_CODE_INVALID", "The code is not correct", whichCode);
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

    private static String digest(UUID userId, ConfirmationPurpose purpose, String binding, String code) {
        try {
            // Without a binding the text is exactly what U24 hashed, so a code issued before U26 still verifies.
            String bound = binding == null ? "" : binding + ":";
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest((userId + ":" + purpose.name() + ":" + bound + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

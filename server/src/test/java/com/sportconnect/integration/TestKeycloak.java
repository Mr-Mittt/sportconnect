package com.sportconnect.integration;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A25: a stand-in for Keycloak's token side, for integration tests. A locally generated RSA key, a tiny HTTP server
 * that serves its JWKS (so the real {@code NimbusJwtDecoder} fetches keys over HTTP exactly as it does against
 * Keycloak), and a builder that mints tokens shaped like the realm's: RS256, {@code iss}, {@code sub} = user id,
 * {@code aud} containing {@code sportconnect-api}, a 5-minute lifetime.
 *
 * <p>One instance per JVM; {@link BaseIT} points {@code app.keycloak.*} at it.
 */
public final class TestKeycloak {

    public static final String KEY_ID = "test-key-1";
    public static final String AUDIENCE = "sportconnect-api";

    private static final RSAKey SIGNING_KEY;
    private static final RSAKey OTHER_KEY;
    private static final HttpServer SERVER;
    private static final AtomicBoolean JWKS_UP = new AtomicBoolean(true);

    public static final String ISSUER;
    public static final String JWK_SET_URI;

    static {
        try {
            SIGNING_KEY = new RSAKeyGenerator(2048).keyID(KEY_ID).generate();
            OTHER_KEY = new RSAKeyGenerator(2048).keyID(KEY_ID).generate();
            SERVER = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
            SERVER.createContext("/jwks", exchange -> {
                if (!JWKS_UP.get()) {
                    exchange.sendResponseHeaders(503, -1);
                    exchange.close();
                    return;
                }
                byte[] body = new JWKSet(SIGNING_KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            SERVER.setExecutor(null);
            SERVER.start();
            String base = "http://127.0.0.1:" + SERVER.getAddress().getPort();
            ISSUER = base + "/realms/sportconnect";
            JWK_SET_URI = base + "/jwks";
        } catch (JOSEException | IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    private TestKeycloak() {
    }

    /** A valid access token for {@code userId}. */
    public static String token(UUID userId) {
        return forUser(userId).build();
    }

    public static Builder forUser(UUID userId) {
        return new Builder(userId.toString());
    }

    /** While {@code false}, the JWKS endpoint answers 503, as a Keycloak that is down would. */
    public static void jwksAvailable(boolean available) {
        JWKS_UP.set(available);
    }

    public static final class Builder {
        private final String subject;
        private String issuer = ISSUER;
        private List<String> audience = List.of(AUDIENCE, "account");
        private Duration lifetime = Duration.ofMinutes(5);
        private boolean signWithOtherKey;
        private String keyId = KEY_ID;
        private List<String> rolesClaim;

        private Builder(String subject) {
            this.subject = subject;
        }

        public Builder issuer(String issuer) {
            this.issuer = issuer;
            return this;
        }

        public Builder audience(String... audience) {
            this.audience = List.of(audience);
            return this;
        }

        /** Negative for a token that is already expired. */
        public Builder lifetime(Duration lifetime) {
            this.lifetime = lifetime;
            return this;
        }

        /** Signs with a key the JWKS does not publish (same {@code kid}), i.e. a forged token. */
        public Builder signedByAnotherKey() {
            this.signWithOtherKey = true;
            return this;
        }

        /** A {@code kid} the JWKS does not know, which makes the decoder re-fetch the key set. */
        public Builder unknownKeyId() {
            this.keyId = "rotated-" + UUID.randomUUID();
            return this;
        }

        /** A role claim the backend must ignore (roles come from the database). */
        public Builder rolesClaim(String... roles) {
            this.rolesClaim = List.of(roles);
            return this;
        }

        public String build() {
            try {
                Instant now = Instant.now();
                JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                        .issuer(issuer)
                        .subject(subject)
                        .audience(audience)
                        .jwtID(UUID.randomUUID().toString())
                        .issueTime(Date.from(lifetime.isNegative() ? now.plus(lifetime).minusSeconds(60) : now))
                        .expirationTime(Date.from(now.plus(lifetime)));
                if (rolesClaim != null) {
                    claims.claim("roles", rolesClaim);
                }
                SignedJWT jwt = new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keyId).build(), claims.build());
                jwt.sign(new RSASSASigner(signWithOtherKey ? OTHER_KEY : SIGNING_KEY));
                return jwt.serialize();
            } catch (JOSEException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}

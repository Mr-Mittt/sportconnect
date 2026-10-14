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
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A stand-in for Keycloak, for integration tests: a locally generated RSA key, a tiny HTTP server that serves its JWKS
 * (so the real {@code NimbusJwtDecoder} fetches keys over HTTP exactly as it does against Keycloak), and a builder that
 * mints tokens shaped like the realm's: RS256, {@code iss}, {@code sub} = user id, {@code aud} containing
 * {@code sportconnect-api}, a 5-minute lifetime (A25).
 *
 * <p>A26 adds the token side the backend now talks to: {@code /token} (authorization code + PKCE, and refresh-token
 * grants with rotation) and {@code /logout} (ends a session). A test scripts a sign-in with {@link #issueCode}, and can
 * ask afterwards whether a session was ended ({@link #sessionEnded}). The server behaves like the real one where the
 * backend depends on it: a code works once, a wrong PKCE verifier is {@code invalid_grant}, a refresh token of an ended session
 * is {@code invalid_grant} (the realm does not revoke a refresh token on use), and {@link #tokenEndpointAvailable} switches the whole token side to 503.
 *
 * <p>One instance per JVM; {@link BaseIT} points {@code app.keycloak.*} at it.
 */
public final class TestKeycloak {

    public static final String KEY_ID = "test-key-1";
    public static final String AUDIENCE = "sportconnect-api";
    public static final String CLIENT_ID = "sportconnect-web";
    public static final String REDIRECT_URI = "http://localhost:5173/auth/callback";

    private static final RSAKey SIGNING_KEY;
    private static final RSAKey OTHER_KEY;
    private static final HttpServer SERVER;
    private static final AtomicBoolean JWKS_UP = new AtomicBoolean(true);
    private static final AtomicBoolean TOKEN_UP = new AtomicBoolean(true);

    private static final Map<String, Pending> CODES = new ConcurrentHashMap<>();
    private static final Map<String, Session> SESSIONS_BY_REFRESH_TOKEN = new ConcurrentHashMap<>();
    private static final Map<UUID, String> LATEST_REFRESH_TOKEN = new ConcurrentHashMap<>();

    public static final String ISSUER;
    public static final String JWK_SET_URI;
    public static final String TOKEN_URI;
    public static final String LOGOUT_URI;

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
            SERVER.createContext("/token", TestKeycloak::handleToken);
            SERVER.createContext("/logout", TestKeycloak::handleLogout);
            SERVER.setExecutor(null);
            SERVER.start();
            String base = "http://127.0.0.1:" + SERVER.getAddress().getPort();
            ISSUER = base + "/realms/sportconnect";
            JWK_SET_URI = base + "/jwks";
            TOKEN_URI = base + "/token";
            LOGOUT_URI = base + "/logout";
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

    /** While {@code false}, the token and end-session endpoints answer 503, as a Keycloak that is down would. */
    public static void tokenEndpointAvailable(boolean available) {
        TOKEN_UP.set(available);
    }

    // ---------- A26: the token side ----------

    /** Who Keycloak says the user is: the claims of the access token the stub mints for them. */
    public static final class Identity {
        private final UUID sub;
        private String email;
        private boolean emailVerified = true;
        private String preferredUsername;
        private String givenName;
        private String familyName;
        private String name;
        private String locale;
        private String phoneNumber;
        private String identityProvider;

        private Identity(UUID sub) {
            this.sub = sub;
        }

        /** A password user: no {@code identity_provider} claim. */
        public static Identity of(UUID sub) {
            return new Identity(sub);
        }

        public Identity email(String email) {
            this.email = email;
            return this;
        }

        public Identity emailVerified(boolean emailVerified) {
            this.emailVerified = emailVerified;
            return this;
        }

        public Identity username(String username) {
            this.preferredUsername = username;
            return this;
        }

        public Identity names(String givenName, String familyName) {
            this.givenName = givenName;
            this.familyName = familyName;
            return this;
        }

        /** The {@code name} claim only (a provider that gives no split name). */
        public Identity fullName(String name) {
            this.name = name;
            return this;
        }

        public Identity locale(String locale) {
            this.locale = locale;
            return this;
        }

        public Identity phone(String phoneNumber) {
            this.phoneNumber = phoneNumber;
            return this;
        }

        /** A social sign-in: Keycloak adds {@code identity_provider} (e.g. {@code google}) for a brokered login. */
        public Identity viaProvider(String provider) {
            this.identityProvider = provider;
            return this;
        }

        public UUID sub() {
            return sub;
        }

        Builder accessToken() {
            Builder b = forUser(sub);
            putIfPresent(b, "email", email);
            if (email != null) {
                b.claim("email_verified", emailVerified);
            }
            putIfPresent(b, "preferred_username", preferredUsername);
            putIfPresent(b, "given_name", givenName);
            putIfPresent(b, "family_name", familyName);
            putIfPresent(b, "name", name);
            putIfPresent(b, "locale", locale);
            putIfPresent(b, "phone_number", phoneNumber);
            putIfPresent(b, "identity_provider", identityProvider);
            return b;
        }

        private static void putIfPresent(Builder b, String claim, String value) {
            if (value != null) {
                b.claim(claim, value);
            }
        }
    }

    /**
     * Scripts one authorization-code sign-in: the returned code can be posted to {@code /api/auth/callback} together with
     * {@code codeVerifier} exactly once, as Keycloak would accept it.
     */
    public static String issueCode(Identity identity, String codeVerifier) {
        String code = "code-" + UUID.randomUUID();
        CODES.put(code, new Pending(identity, codeVerifier));
        return code;
    }

    /** Starts a live session directly (as if the user had signed in earlier) and returns its refresh token. */
    public static String startSession(Identity identity) {
        return new Session(identity).newRefreshToken();
    }

    /** The newest refresh token issued for {@code sub}: what the backend holds after a sign-in whose cookie the test did not keep. */
    public static String latestRefreshToken(UUID sub) {
        return LATEST_REFRESH_TOKEN.get(sub);
    }

    /** Whether the session that {@code refreshToken} (any it ever issued) belongs to has been ended by a logout. */
    public static boolean sessionEnded(String refreshToken) {
        Session session = SESSIONS_BY_REFRESH_TOKEN.get(refreshToken);
        return session != null && session.ended;
    }

    /** Whether the session exists and is still alive. */
    public static boolean sessionAlive(String refreshToken) {
        Session session = SESSIONS_BY_REFRESH_TOKEN.get(refreshToken);
        return session != null && !session.ended;
    }

    /** Ends the session of {@code refreshToken} out of band, as an idle timeout or another logout would. */
    public static void expireSession(String refreshToken) {
        Session session = SESSIONS_BY_REFRESH_TOKEN.get(refreshToken);
        if (session != null) {
            session.ended = true;
        }
    }

    private record Pending(Identity identity, String codeVerifier) {
    }

    private static final class Session {
        private final Identity identity;
        private final Set<String> liveRefreshTokens = ConcurrentHashMap.newKeySet();
        private volatile boolean ended;

        private Session(Identity identity) {
            this.identity = identity;
        }

        String newRefreshToken() {
            String token = "refresh-" + UUID.randomUUID();
            liveRefreshTokens.add(token);
            SESSIONS_BY_REFRESH_TOKEN.put(token, this);
            LATEST_REFRESH_TOKEN.put(identity.sub(), token);
            return token;
        }
    }

    private static void handleToken(HttpExchange exchange) throws IOException {
        if (!TOKEN_UP.get()) {
            respond(exchange, 503, "{}");
            return;
        }
        Map<String, String> form = readForm(exchange);
        if (!CLIENT_ID.equals(form.get("client_id"))) {
            respond(exchange, 401, "{\"error\":\"unauthorized_client\"}");
            return;
        }
        Session session;
        switch (form.getOrDefault("grant_type", "")) {
            case "authorization_code" -> {
                Pending pending = CODES.remove(form.get("code"));
                if (pending == null
                        || !REDIRECT_URI.equals(form.get("redirect_uri"))
                        || !pending.codeVerifier().equals(form.get("code_verifier"))) {
                    respond(exchange, 400, "{\"error\":\"invalid_grant\"}");
                    return;
                }
                session = new Session(pending.identity());
            }
            case "refresh_token" -> {
                String presented = form.get("refresh_token");
                session = SESSIONS_BY_REFRESH_TOKEN.get(presented);
                // Like the realm's default (revokeRefreshToken off): a refresh token keeps working until its session
                // ends, and every refresh also hands out a new one. An ended session accepts none.
                if (session == null || session.ended || !session.liveRefreshTokens.contains(presented)) {
                    respond(exchange, 400, "{\"error\":\"invalid_grant\"}");
                    return;
                }
            }
            default -> {
                respond(exchange, 400, "{\"error\":\"unsupported_grant_type\"}");
                return;
            }
        }
        String json = "{\"access_token\":\"" + session.identity.accessToken().build()
                + "\",\"refresh_token\":\"" + session.newRefreshToken()
                + "\",\"expires_in\":300,\"refresh_expires_in\":86400,\"token_type\":\"Bearer\"}";
        respond(exchange, 200, json);
    }

    private static void handleLogout(HttpExchange exchange) throws IOException {
        if (!TOKEN_UP.get()) {
            respond(exchange, 503, "{}");
            return;
        }
        Map<String, String> form = readForm(exchange);
        Session session = SESSIONS_BY_REFRESH_TOKEN.get(form.get("refresh_token"));
        if (session == null || session.ended || !session.liveRefreshTokens.contains(form.get("refresh_token"))) {
            respond(exchange, 400, "{\"error\":\"invalid_grant\"}");
            return;
        }
        session.ended = true;
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
    }

    private static Map<String, String> readForm(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, String> form = new HashMap<>();
        for (String pair : body.split("&")) {
            if (pair.isEmpty()) {
                continue;
            }
            int eq = pair.indexOf('=');
            String key = URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), StandardCharsets.UTF_8);
            String value = eq < 0 ? "" : URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            form.put(key, value);
        }
        return form;
    }

    private static void respond(HttpExchange exchange, int status, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    public static final class Builder {
        private final String subject;
        private String issuer = ISSUER;
        private List<String> audience = List.of(AUDIENCE, "account");
        private Duration lifetime = Duration.ofMinutes(5);
        private boolean signWithOtherKey;
        private String keyId = KEY_ID;
        private List<String> rolesClaim;
        private final Map<String, Object> extraClaims = new HashMap<>();

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

        /** Any other claim (A26: email, name, locale, phone_number, identity_provider...). */
        public Builder claim(String name, Object value) {
            this.extraClaims.put(name, value);
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
                extraClaims.forEach(claims::claim);
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

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
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    /** U24: the backend-only confidential client (password check + service account) and its secret. */
    public static final String CREDENTIALS_CLIENT_ID = "sportconnect-credentials";
    public static final String CREDENTIALS_CLIENT_SECRET = "it-credentials-secret";
    private static final String SERVICE_TOKEN = "service-account-token";
    private static final int MIN_PASSWORD_LENGTH = 8;
    /** A value the stand-in realm policy refuses besides the length rule (stands for a blocklist/not-recently-used rule). */
    public static final String POLICY_REJECTED_PASSWORD = "password1";
    private static final Pattern PASSWORD_VALUE = Pattern.compile("\"value\"\\s*:\\s*\"([^\"]*)\"");

    private static final RSAKey SIGNING_KEY;
    private static final RSAKey OTHER_KEY;
    private static final HttpServer SERVER;
    private static final AtomicBoolean JWKS_UP = new AtomicBoolean(true);
    private static final AtomicBoolean TOKEN_UP = new AtomicBoolean(true);

    private static final Map<String, Pending> CODES = new ConcurrentHashMap<>();
    private static final Map<String, Session> SESSIONS_BY_REFRESH_TOKEN = new ConcurrentHashMap<>();
    private static final Map<UUID, String> LATEST_REFRESH_TOKEN = new ConcurrentHashMap<>();
    /** U24: the Keycloak users a test registered: username and password (a user with no entry has no password). */
    private static final Map<UUID, String> USERNAMES = new ConcurrentHashMap<>();
    private static final Map<UUID, String> PASSWORDS = new ConcurrentHashMap<>();
    private static final AtomicBoolean ADMIN_UP = new AtomicBoolean(true);
    /** A33: Keycloak's built-in emailVerified per user (absent: false) and the verification mails it was asked to send. */
    private static final Set<UUID> EMAIL_VERIFIED = ConcurrentHashMap.newKeySet();
    private static final Map<UUID, List<String>> VERIFICATION_REQUESTS = new ConcurrentHashMap<>();
    /**
     * U26: what the admin user endpoints keep of a user besides the username: the email, the attribute map (an update
     * replaces it, as in Keycloak) and the identity provider links (Google...).
     */
    private static final Map<UUID, String> EMAILS = new ConcurrentHashMap<>();
    private static final Map<UUID, Map<String, List<String>>> ATTRIBUTES = new ConcurrentHashMap<>();
    private static final Map<UUID, Set<String>> IDENTITY_LINKS = new ConcurrentHashMap<>();
    /** Mirrors the realm's editUsernameAllowed (infra/scripts/apply-realm-edit-username.sh); false refuses a username change. */
    private static final AtomicBoolean EDIT_USERNAME_ALLOWED = new AtomicBoolean(true);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final String ISSUER;
    public static final String JWK_SET_URI;
    public static final String TOKEN_URI;
    public static final String LOGOUT_URI;
    public static final String ADMIN_URI;

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
            SERVER.createContext("/admin/users", TestKeycloak::handleAdminUsers);
            SERVER.setExecutor(null);
            SERVER.start();
            String base = "http://127.0.0.1:" + SERVER.getAddress().getPort();
            ISSUER = base + "/realms/sportconnect";
            JWK_SET_URI = base + "/jwks";
            TOKEN_URI = base + "/token";
            LOGOUT_URI = base + "/logout";
            ADMIN_URI = base + "/admin";
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

    // ---------- U24: passwords live in Keycloak ----------

    /** Registers a Keycloak user with a password ({@code null} password: a social-only user). */
    public static void registerUser(UUID userId, String username, String password) {
        USERNAMES.put(userId, username);
        if (password == null) {
            PASSWORDS.remove(userId);
        } else {
            PASSWORDS.put(userId, password);
        }
    }

    /** The user's current Keycloak password, or null. */
    public static String passwordOf(UUID userId) {
        return PASSWORDS.get(userId);
    }

    // ---------- A33: email verification ----------

    /** Sets what Keycloak holds as the user's emailVerified (a user starts unverified). */
    public static void setEmailVerified(UUID userId, boolean verified) {
        if (verified) {
            EMAIL_VERIFIED.add(userId);
        } else {
            EMAIL_VERIFIED.remove(userId);
        }
    }

    /** The query strings of the verify-email requests Keycloak received for the user, oldest first. */
    public static List<String> verificationRequests(UUID userId) {
        return List.copyOf(VERIFICATION_REQUESTS.getOrDefault(userId, List.of()));
    }

    /** Forgets every verification state and request (between tests). */
    public static void resetVerification() {
        EMAIL_VERIFIED.clear();
        VERIFICATION_REQUESTS.clear();
    }

    // ---------- U26: email change ----------

    /**
     * Registers a Keycloak user with an email as a registration through the realm's flows leaves it: the username and the
     * {@code email_normalized} attribute (the A35 key) set. {@code password} may be null (a Google-only user).
     */
    public static void registerUser(UUID userId, String username, String email, String password) {
        registerUser(userId, username, password);
        EMAILS.put(userId, email.toLowerCase(Locale.ROOT));
        Map<String, List<String>> attributes = new LinkedHashMap<>();
        attributes.put("email_normalized", List.of(keyOf(email)));
        ATTRIBUTES.put(userId, attributes);
    }

    /** Sets (replaces) one attribute of the user, as a realm mapper would (for example {@code picture}). */
    public static void setAttribute(UUID userId, String name, String value) {
        ATTRIBUTES.computeIfAbsent(userId, id -> new ConcurrentHashMap<>()).put(name, List.of(value));
    }

    /** Links the user to an identity provider, as a Google sign-in would. */
    public static void linkIdentity(UUID userId, String alias) {
        IDENTITY_LINKS.computeIfAbsent(userId, id -> ConcurrentHashMap.newKeySet()).add(alias);
    }

    public static Set<String> identityLinks(UUID userId) {
        return Set.copyOf(IDENTITY_LINKS.getOrDefault(userId, Set.of()));
    }

    public static String emailOf(UUID userId) {
        return EMAILS.get(userId);
    }

    public static String usernameOf(UUID userId) {
        return USERNAMES.get(userId);
    }

    public static boolean isEmailVerified(UUID userId) {
        return EMAIL_VERIFIED.contains(userId);
    }

    public static Map<String, List<String>> attributesOf(UUID userId) {
        return Map.copyOf(ATTRIBUTES.getOrDefault(userId, Map.of()));
    }

    /** While {@code false}, a username change is refused as Keycloak does with editUsernameAllowed=false. */
    public static void editUsernameAllowed(boolean allowed) {
        EDIT_USERNAME_ALLOWED.set(allowed);
    }

    /** Forgets the emails, attributes and links (not the passwords) of every user. */
    public static void resetIdentities() {
        EMAILS.clear();
        ATTRIBUTES.clear();
        IDENTITY_LINKS.clear();
        EDIT_USERNAME_ALLOWED.set(true);
    }

    /** What the realm's listener stores: the A35 key. A deliberately separate, small copy: the test pins the backend to it. */
    private static String keyOf(String raw) {
        String email = raw.trim().toLowerCase(Locale.ROOT);
        int at = email.lastIndexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        if (!domain.equals("gmail.com") && !domain.equals("googlemail.com")) {
            return email;
        }
        int plus = local.indexOf('+');
        if (plus >= 0) {
            local = local.substring(0, plus);
        }
        return local.replace(".", "") + "@gmail.com";
    }

    /** While {@code false}, the admin endpoints answer 503 (the password grant keeps working). */
    public static void adminAvailable(boolean available) {
        ADMIN_UP.set(available);
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
        private final java.util.Map<String, String> extraClaims = new java.util.LinkedHashMap<>();

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

        /**
         * A32: the register page's attributes as Keycloak's attribute mapper emits them (always strings):
         * {@code country_id}, {@code region_id}, {@code latitude}, {@code longitude}. A {@code null} value is omitted.
         */
        public Identity geo(String countryId, String regionId, String latitude, String longitude) {
            extraClaims.put("country_id", countryId);
            extraClaims.put("region_id", regionId);
            extraClaims.put("latitude", latitude);
            extraClaims.put("longitude", longitude);
            return this;
        }

        /** A36: the Google profile picture as Keycloak's token mapper emits it (the {@code picture} claim). */
        public Identity picture(String url) {
            extraClaims.put("picture", url);
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
            extraClaims.forEach((name, value) -> putIfPresent(b, name, value));
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
        if (CREDENTIALS_CLIENT_ID.equals(form.get("client_id"))) {
            handleCredentialsToken(exchange, form);
            return;
        }
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

    /** U24: the credentials client's two grants: client credentials (the service account) and the password check. */
    private static void handleCredentialsToken(HttpExchange exchange, Map<String, String> form) throws IOException {
        if (!CREDENTIALS_CLIENT_SECRET.equals(form.get("client_secret"))) {
            respond(exchange, 401, "{\"error\":\"invalid_client\"}");
            return;
        }
        switch (form.getOrDefault("grant_type", "")) {
            case "client_credentials" ->
                    respond(exchange, 200, "{\"access_token\":\"" + SERVICE_TOKEN + "\",\"expires_in\":60,\"token_type\":\"Bearer\"}");
            case "password" -> {
                boolean ok = USERNAMES.entrySet().stream()
                        .anyMatch(e -> e.getValue().equals(form.get("username"))
                                && form.get("password") != null
                                && form.get("password").equals(PASSWORDS.get(e.getKey())));
                if (ok) {
                    respond(exchange, 200, "{\"access_token\":\"discarded\",\"refresh_token\":\"discarded\",\"expires_in\":60,\"token_type\":\"Bearer\"}");
                } else {
                    respond(exchange, 401, "{\"error\":\"invalid_grant\",\"error_description\":\"Invalid user credentials\"}");
                }
            }
            default -> respond(exchange, 400, "{\"error\":\"unsupported_grant_type\"}");
        }
    }

    /** U24: GET /admin/users/{id} (the username) and PUT /admin/users/{id}/reset-password, for the service account only. */
    private static void handleAdminUsers(HttpExchange exchange) throws IOException {
        String auth = exchange.getRequestHeaders().getFirst("Authorization");
        if (!ADMIN_UP.get()) {
            respond(exchange, 503, "{}");
            return;
        }
        if (!("Bearer " + SERVICE_TOKEN).equals(auth)) {
            respond(exchange, 401, "{}");
            return;
        }
        String path = exchange.getRequestURI().getPath();
        if ("/admin/users".equals(path) && "GET".equals(exchange.getRequestMethod())) {
            handleUserSearch(exchange);
            return;
        }
        String[] parts = path.substring("/admin/users/".length()).split("/");
        UUID userId;
        try {
            userId = UUID.fromString(parts[0]);
        } catch (IllegalArgumentException e) {
            respond(exchange, 404, "{}");
            return;
        }
        if (!USERNAMES.containsKey(userId)) {
            respond(exchange, 404, "{\"error\":\"User not found\"}");
            return;
        }
        if (parts.length == 1 && "GET".equals(exchange.getRequestMethod())) {
            Map<String, Object> user = new LinkedHashMap<>();
            user.put("id", userId.toString());
            user.put("username", USERNAMES.get(userId));
            if (EMAILS.containsKey(userId)) {
                user.put("email", EMAILS.get(userId));
            }
            user.put("emailVerified", EMAIL_VERIFIED.contains(userId));
            user.put("enabled", true);
            user.put("attributes", ATTRIBUTES.getOrDefault(userId, Map.of()));
            user.put("createdTimestamp", 1L);
            user.put("totp", false);
            user.put("disableableCredentialTypes", List.of());
            user.put("notBefore", 0);
            user.put("federatedIdentities", List.of());
            respond(exchange, 200, MAPPER.writeValueAsString(user));
            return;
        }
        if (parts.length == 1 && "PUT".equals(exchange.getRequestMethod())) {
            handleUserUpdate(exchange, userId);
            return;
        }
        if (parts.length >= 2 && "federated-identity".equals(parts[1])) {
            handleFederatedIdentity(exchange, userId, parts);
            return;
        }
        if (parts.length == 2 && "send-verify-email".equals(parts[1]) && "PUT".equals(exchange.getRequestMethod())) {
            VERIFICATION_REQUESTS.computeIfAbsent(userId, id -> new java.util.concurrent.CopyOnWriteArrayList<>())
                    .add(URLDecoder.decode(String.valueOf(exchange.getRequestURI().getRawQuery()), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (parts.length == 2 && "reset-password".equals(parts[1]) && "PUT".equals(exchange.getRequestMethod())) {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Matcher value = PASSWORD_VALUE.matcher(body);
            if (!value.find() || value.group(1).length() < MIN_PASSWORD_LENGTH || POLICY_REJECTED_PASSWORD.equals(value.group(1))) {
                respond(exchange, 400, "{\"error\":\"invalidPasswordMinLengthMessage\"}");
                return;
            }
            PASSWORDS.put(userId, value.group(1));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        respond(exchange, 404, "{}");
    }

    /** U26: GET /admin/users?q=name:value&exact=true or ?email=...&exact=true, as Keycloak lists the matches. */
    private static void handleUserSearch(HttpExchange exchange) throws IOException {
        Map<String, String> query = new HashMap<>();
        for (String pair : String.valueOf(exchange.getRequestURI().getRawQuery()).split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                query.put(kv[0], URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
            }
        }
        List<Map<String, Object>> found = new ArrayList<>();
        for (UUID id : USERNAMES.keySet()) {
            boolean match = false;
            String q = query.get("q");
            if (q != null && q.contains(":")) {
                String name = q.substring(0, q.indexOf(':'));
                String value = q.substring(q.indexOf(':') + 1);
                match = ATTRIBUTES.getOrDefault(id, Map.of()).getOrDefault(name, List.of()).contains(value);
            } else if (query.get("email") != null) {
                match = query.get("email").equalsIgnoreCase(EMAILS.get(id));
            }
            if (match) {
                Map<String, Object> user = new LinkedHashMap<>();
                user.put("id", id.toString());
                user.put("username", USERNAMES.get(id));
                user.put("email", EMAILS.get(id));
                found.add(user);
            }
        }
        respond(exchange, 200, MAPPER.writeValueAsString(found));
    }

    /**
     * U26: PUT /admin/users/{id} with a user record, with the refusals the realm gives: an email another user holds is a 409,
     * an email_normalized another user holds is the A35 validator's 400 emailAlreadyUsed, a changed username is refused while
     * editUsernameAllowed is false. The attribute map is replaced, not merged.
     */
    private static void handleUserUpdate(HttpExchange exchange, UUID userId) throws IOException {
        Map<String, Object> body = MAPPER.readValue(exchange.getRequestBody().readAllBytes(), new TypeReference<>() { });
        String email = (String) body.get("email");
        @SuppressWarnings("unchecked")
        Map<String, List<String>> attributes = body.get("attributes") == null
                ? null : (Map<String, List<String>>) body.get("attributes");
        if (email != null) {
            for (Map.Entry<UUID, String> other : EMAILS.entrySet()) {
                if (!other.getKey().equals(userId) && other.getValue().equalsIgnoreCase(email)) {
                    respond(exchange, 409, "{\"errorMessage\":\"User exists with same email\"}");
                    return;
                }
            }
        }
        if (attributes != null && attributes.get("email_normalized") != null) {
            for (Map.Entry<UUID, Map<String, List<String>>> other : ATTRIBUTES.entrySet()) {
                if (!other.getKey().equals(userId)
                        && attributes.get("email_normalized").equals(other.getValue().get("email_normalized"))) {
                    respond(exchange, 400, "{\"field\":\"email\",\"errorMessage\":\"emailAlreadyUsed\",\"params\":[\"email\"]}");
                    return;
                }
            }
        }
        String username = (String) body.get("username");
        if (username != null && !username.equals(USERNAMES.get(userId))) {
            if (!EDIT_USERNAME_ALLOWED.get()) {
                respond(exchange, 400, "{\"field\":\"username\",\"errorMessage\":\"error-user-attribute-read-only\"}");
                return;
            }
            USERNAMES.put(userId, username);
        }
        if (email != null) {
            EMAILS.put(userId, email);
        }
        if (body.get("emailVerified") != null) {
            if (Boolean.TRUE.equals(body.get("emailVerified"))) {
                EMAIL_VERIFIED.add(userId);
            } else {
                EMAIL_VERIFIED.remove(userId);
            }
        }
        if (attributes != null) {
            ATTRIBUTES.put(userId, new ConcurrentHashMap<>(attributes));
        }
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
    }

    /** U26: GET /admin/users/{id}/federated-identity and DELETE /admin/users/{id}/federated-identity/{alias}. */
    private static void handleFederatedIdentity(HttpExchange exchange, UUID userId, String[] parts) throws IOException {
        if (parts.length == 2 && "GET".equals(exchange.getRequestMethod())) {
            List<Map<String, Object>> links = new ArrayList<>();
            for (String alias : IDENTITY_LINKS.getOrDefault(userId, Set.of())) {
                links.add(Map.of("identityProvider", alias, "userId", "idp-" + userId, "userName", "x"));
            }
            respond(exchange, 200, MAPPER.writeValueAsString(links));
            return;
        }
        if (parts.length == 3 && "DELETE".equals(exchange.getRequestMethod())) {
            boolean removed = IDENTITY_LINKS.getOrDefault(userId, ConcurrentHashMap.newKeySet()).remove(parts[2]);
            exchange.sendResponseHeaders(removed ? 204 : 404, -1);
            exchange.close();
            return;
        }
        respond(exchange, 404, "{}");
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

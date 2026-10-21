package com.sportconnect.auth.service;

import com.sportconnect.auth.api.service.KeycloakCredentialService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.auth.config.KeycloakProperties;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.common.exception.ServiceUnavailableException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * U24: the backend's side of the password conversation, as the confidential realm client {@code sportconnect-credentials}
 * (backend only, no browser flow). Two jobs, nothing else:
 *
 * <ul>
 *   <li>{@link #verifyPassword}: a password grant for the user, read for its answer only; the tokens are dropped.</li>
 *   <li>{@link #setPassword}: the admin {@code reset-password} call, authorised by the client's service account, which the
 *       realm limits to {@code manage-users} and {@code view-users}.</li>
 * </ul>
 *
 * <p>A33 adds two reads and one send on the same service account ({@code manage-users} covers all three): whether the
 * user's email is verified, and the realm's verification email.
 *
 * <p>Failure mapping: a refusal of the user's credentials ({@code invalid_grant}) is the answer {@code false}; anything
 * that is not the user's doing (Keycloak down, a 5xx, {@code unauthorized_client} (Keycloak 26) or {@code invalid_client} meaning the secret is wrong, a service
 * account without the role) is {@link ServiceUnavailableException}, because retrying later may work and nothing was
 * changed.
 */
@Service
@Slf4j
class KeycloakCredentialServiceImpl implements KeycloakCredentialService {

    private final KeycloakProperties properties;
    private final RestClient restClient;
    private static final ObjectMapper JSON = new ObjectMapper();
    /** Fields of a Keycloak user read that are not ours to write back on an update. */
    private static final List<String> READ_ONLY_FIELDS = List.of("id", "createdTimestamp", "totp", "disableableCredentialTypes",
            "notBefore", "access", "federatedIdentities", "federationLink", "self");

    KeycloakCredentialServiceImpl(KeycloakProperties properties) {
        this.properties = properties;
        // The JDK client, not HttpURLConnection: Keycloak answers a wrong password with a 401 and a JSON body, and
        // HttpURLConnection refuses to hand over the body of a 401 that carries no WWW-Authenticate header.
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public boolean verifyPassword(UUID userId, String password) {
        if (password == null || password.isEmpty()) {
            return false;
        }
        String username = findUsername(userId);
        if (username == null) {
            return false;
        }
        MultiValueMap<String, String> form = clientForm("password");
        form.add("username", username);
        form.add("password", password);
        Reply reply = postForm(properties.getTokenUri(), form);
        if (reply.status().is2xxSuccessful()) {
            return true;
        }
        if ("invalid_grant".equals(reply.body().get("error"))) {
            return false;
        }
        throw new ServiceUnavailableException("Keycloak refused the password check: " + reply.status().value() + " " + reply.body().get("error"));
    }

    @Override
    public void setPassword(UUID userId, String newPassword) {
        String adminToken = serviceAccountToken();
        Map<String, Object> credential = Map.of("type", "password", "value", newPassword, "temporary", false);
        Reply reply = call(() -> restClient.put()
                .uri(properties.getAdminUri() + "/users/" + userId + "/reset-password")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(credential)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (reply.status().is2xxSuccessful()) {
            return;
        }
        if (reply.status().value() == 404) {
            throw new ResourceNotFoundException("Keycloak user", "id", userId);
        }
        if (reply.status().value() == 400) {
            // The realm password policy (or an empty value) refused it; Keycloak's text names the rule, ours is the code.
            throw new BadRequestException("NEW_PASSWORD_REJECTED", "The new password does not meet the password rules", null);
        }
        throw new ServiceUnavailableException("Keycloak answered " + reply.status().value() + " to a password reset");
    }

    @Override
    public boolean isEmailVerified(UUID userId) {
        String adminToken = serviceAccountToken();
        Reply reply = call(() -> restClient.get()
                .uri(properties.getAdminUri() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (reply.status().value() == 404) {
            throw new ResourceNotFoundException("Keycloak user", "id", userId);
        }
        if (!reply.status().is2xxSuccessful()) {
            throw new ServiceUnavailableException("Keycloak answered " + reply.status().value() + " to a user lookup");
        }
        return Boolean.TRUE.equals(reply.body().get("emailVerified"));
    }

    @Override
    public void sendVerificationEmail(UUID userId) {
        String adminToken = serviceAccountToken();
        String lifespan = String.valueOf(properties.getVerificationLinkLifespan().toSeconds());
        // The link's "back to the application" goes to the web app's root: the origin of the sign-in redirect URI.
        String webApp = URI.create(properties.getRedirectUri()).resolve("/").toString();
        Reply reply = call(() -> restClient.put()
                .uri(properties.getAdminUri() + "/users/" + userId + "/send-verify-email?client_id={client}&redirect_uri={redirect}&lifespan={lifespan}",
                        properties.getClientId(), webApp, lifespan)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (reply.status().is2xxSuccessful()) {
            return;
        }
        if (reply.status().value() == 404) {
            throw new ResourceNotFoundException("Keycloak user", "id", userId);
        }
        if (reply.status().value() == 400) {
            throw new BadRequestException("VERIFICATION_EMAIL_UNAVAILABLE", "This account has no email to send to", null);
        }
        throw new ServiceUnavailableException("Keycloak answered " + reply.status().value() + " to a verification email request");
    }

    @Override
    public boolean isEmailRegistered(String email, UUID exceptUserId) {
        String address = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        String key = EmailRules.normalized(address);
        if (key == null) {
            return false;
        }
        String adminToken = serviceAccountToken();
        // By key (every account made through the realm's flows has one), and by the exact address for an account that has none.
        List<Map<String, Object>> holders = new ArrayList<>(searchUsers(adminToken, EmailRules.ATTRIBUTE + ":" + key, null));
        holders.addAll(searchUsers(adminToken, null, address));
        return holders.stream().anyMatch(holder -> !String.valueOf(exceptUserId).equals(holder.get("id")));
    }

    @Override
    public void replaceEmail(UUID userId, String newEmail) {
        String address = newEmail == null ? "" : newEmail.trim().toLowerCase(Locale.ROOT);
        String key = EmailRules.normalized(address);
        if (key == null) {
            throw new IllegalArgumentException("not an email address: " + newEmail);
        }
        String adminToken = serviceAccountToken();
        Reply current = call(() -> restClient.get()
                .uri(properties.getAdminUri() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (current.status().value() == 404) {
            throw new ResourceNotFoundException("Keycloak user", "id", userId);
        }
        if (!current.status().is2xxSuccessful()) {
            throw new ServiceUnavailableException("Keycloak answered " + current.status().value() + " to a user lookup");
        }

        // An update replaces the attribute map, so the whole record goes back with only these fields changed.
        Map<String, Object> user = new LinkedHashMap<>(current.body());
        String oldEmail = user.get("email") instanceof String old ? old : null;
        Map<String, Object> attributes = user.get("attributes") instanceof Map<?, ?> existing
                ? new LinkedHashMap<>(castAttributes(existing)) : new LinkedHashMap<>();
        attributes.put(EmailRules.ATTRIBUTE, List.of(key));
        attributes.remove("picture");
        for (String readOnly : READ_ONLY_FIELDS) {
            user.remove(readOnly);
        }
        user.put("attributes", attributes);
        user.put("email", address);
        user.put("emailVerified", true);
        // A password account registered with an email has that email as its username (A27): the old address would keep
        // signing in, and nobody else could register it. Any other username (a phone, a name) stays.
        if (user.get("username") instanceof String username && oldEmail != null
                && key(username) != null && key(username).equals(key(oldEmail))) {
            user.put("username", address);
        }

        Reply update = call(() -> restClient.put()
                .uri(properties.getAdminUri() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(user)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (!update.status().is2xxSuccessful()) {
            int status = update.status().value();
            if (status == 404) {
                throw new ResourceNotFoundException("Keycloak user", "id", userId);
            }
            if (status == 409 || (status == 400 && "emailAlreadyUsed".equals(update.body().get("errorMessage")))) {
                throw new ConflictException("EMAIL_ALREADY_REGISTERED", "This email address is already registered", null);
            }
            // Anything else is not the user's doing. A refused username (error-user-attribute-read-only) means the realm
            // was not given editUsernameAllowed=true (infra/scripts/apply-realm-edit-username.sh).
            log.error("Keycloak refused the email change of user {}: {} {}", userId, status, update.body());
            throw new ServiceUnavailableException("Keycloak answered " + status + " to an email change");
        }

        unlinkEveryIdentityProvider(adminToken, userId);
    }

    /** Deletes the user's federated identities (the Google link); a failure is a 503 and the repeat of the change finishes it. */
    private void unlinkEveryIdentityProvider(String adminToken, UUID userId) {
        ListReply links = callList(() -> restClient.get()
                .uri(properties.getAdminUri() + "/users/" + userId + "/federated-identity")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .exchange((request, response) -> new ListReply(response.getStatusCode(), readJsonList(response))));
        if (!links.status().is2xxSuccessful()) {
            log.error("The email of user {} changed but its identity providers could not be read: {}", userId, links.status().value());
            throw new ServiceUnavailableException("Keycloak answered " + links.status().value() + " to a federated identity lookup");
        }
        for (Map<String, Object> link : links.body()) {
            if (!(link.get("identityProvider") instanceof String alias)) {
                continue;
            }
            Reply removed = call(() -> restClient.delete()
                    .uri(properties.getAdminUri() + "/users/" + userId + "/federated-identity/{alias}", alias)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
            if (!removed.status().is2xxSuccessful() && removed.status().value() != 404) {
                log.error("The email of user {} changed but the {} link could not be removed: {}", userId, alias, removed.status().value());
                throw new ServiceUnavailableException("Keycloak answered " + removed.status().value() + " to a federated identity delete");
            }
        }
    }

    /** Users matching an attribute query ({@code name:value}, exact) or an exact email, as Keycloak lists them. */
    private List<Map<String, Object>> searchUsers(String adminToken, String attributeQuery, String email) {
        ListReply reply = callList(() -> {
            RestClient.RequestHeadersSpec<?> request = attributeQuery != null
                    ? restClient.get().uri(properties.getAdminUri() + "/users?q={q}&exact=true", attributeQuery)
                    : restClient.get().uri(properties.getAdminUri() + "/users?email={email}&exact=true", email);
            return request
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .exchange((req, response) -> new ListReply(response.getStatusCode(), readJsonList(response)));
        });
        if (!reply.status().is2xxSuccessful()) {
            throw new ServiceUnavailableException("Keycloak answered " + reply.status().value() + " to a user search");
        }
        return reply.body();
    }

    private static String key(String value) {
        return EmailRules.normalized(value);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castAttributes(Map<?, ?> attributes) {
        return (Map<String, Object>) attributes;
    }

    /** The user's Keycloak username (the password grant needs it), or {@code null} when Keycloak has no such user. */
    private String findUsername(UUID userId) {
        String adminToken = serviceAccountToken();
        Reply reply = call(() -> restClient.get()
                .uri(properties.getAdminUri() + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
        if (reply.status().value() == 404) {
            return null;
        }
        if (!reply.status().is2xxSuccessful() || !(reply.body().get("username") instanceof String username)) {
            throw new ServiceUnavailableException("Keycloak answered " + reply.status().value() + " to a user lookup");
        }
        return username;
    }

    /** The access token of the credentials client's own service account (client credentials grant). */
    private String serviceAccountToken() {
        Reply reply = postForm(properties.getTokenUri(), clientForm("client_credentials"));
        if (!reply.status().is2xxSuccessful() || !(reply.body().get("access_token") instanceof String token)) {
            throw new ServiceUnavailableException("The credentials client could not get a service token: " + reply.status().value());
        }
        return token;
    }

    private MultiValueMap<String, String> clientForm(String grantType) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", grantType);
        form.add("client_id", properties.getCredentialsClientId());
        form.add("client_secret", properties.getCredentialsClientSecret());
        return form;
    }

    private Reply postForm(String uri, MultiValueMap<String, String> form) {
        return call(() -> restClient.post()
                .uri(uri)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .exchange((request, response) -> new Reply(response.getStatusCode(), readJson(response))));
    }

    private static Reply call(Supplier<Reply> request) {
        try {
            return request.get();
        } catch (RestClientException e) {
            throw new ServiceUnavailableException("Keycloak is not reachable: " + e.getMessage(), e);
        }
    }

    /** The JSON body as a map; empty for no body or one that is not a JSON object (a 204, an HTML error page). */
    private static Map<String, Object> readJson(ClientHttpResponse response) {
        try {
            byte[] bytes = response.getBody().readAllBytes();
            if (bytes.length == 0) {
                return Map.of();
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> body = JSON.readValue(bytes, Map.class);
            return body == null ? Map.of() : body;
        } catch (IOException | RuntimeException e) {
            return Map.of();
        }
    }

    private static ListReply callList(Supplier<ListReply> request) {
        try {
            return request.get();
        } catch (RestClientException e) {
            throw new ServiceUnavailableException("Keycloak is not reachable: " + e.getMessage(), e);
        }
    }

    /** The JSON body as a list of objects; empty for no body or one that is not a JSON array. */
    private static List<Map<String, Object>> readJsonList(ClientHttpResponse response) {
        try {
            byte[] bytes = response.getBody().readAllBytes();
            if (bytes.length == 0) {
                return List.of();
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> body = JSON.readValue(bytes, List.class);
            return body == null ? List.of() : body;
        } catch (IOException | RuntimeException e) {
            return List.of();
        }
    }

    private record ListReply(HttpStatusCode status, List<Map<String, Object>> body) {
    }

    private record Reply(HttpStatusCode status, Map<String, Object> body) {
    }
}

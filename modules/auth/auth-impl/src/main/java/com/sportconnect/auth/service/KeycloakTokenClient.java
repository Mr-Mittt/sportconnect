package com.sportconnect.auth.service;

import com.sportconnect.auth.config.KeycloakProperties;
import com.sportconnect.common.exception.ServiceUnavailableException;
import com.sportconnect.common.exception.UnauthorizedException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Map;

/**
 * A26: the backend's side of the Keycloak conversation, as the realm's public client {@code sportconnect-web}:
 * completes the Authorization Code + PKCE exchange, rotates a refresh token and ends an SSO session.
 *
 * <p>Failure mapping, shared by the three calls: Keycloak refusing the grant (HTTP 400, {@code invalid_grant} or
 * {@code invalid_request}: a used, expired or foreign code, a wrong verifier, a dead refresh token) is the caller's
 * error; anything else (connection refused, timeout, 5xx, or a 401/403 that means this app is misconfigured) is
 * {@link ServiceUnavailableException}, because nothing the user did can fix it and nothing was changed.
 */
@Component
@Slf4j
class KeycloakTokenClient {

    private final KeycloakProperties properties;
    private final RestClient restClient;

    KeycloakTokenClient(KeycloakProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * Trades the one-time code and the PKCE verifier for tokens.
     *
     * @throws UnauthorizedException {@code AUTH_CODE_INVALID} when Keycloak refuses the code or the verifier
     * @throws ServiceUnavailableException when Keycloak cannot be reached or answers unexpectedly
     */
    KeycloakTokens exchangeCode(String code, String codeVerifier) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", properties.getClientId());
        form.add("code", code);
        form.add("redirect_uri", properties.getRedirectUri());
        form.add("code_verifier", codeVerifier);
        Reply reply = post(properties.getTokenUri(), form);
        if (reply.refused()) {
            throw new UnauthorizedException("AUTH_CODE_INVALID", "The sign-in code is invalid or has expired", null);
        }
        return reply.tokens();
    }

    /**
     * Rotates a refresh token: a new access and refresh token for the same SSO session.
     *
     * @throws UnauthorizedException {@code REFRESH_TOKEN_EXPIRED_OR_REVOKED} when Keycloak no longer honours the token
     * @throws ServiceUnavailableException when Keycloak cannot be reached or answers unexpectedly
     */
    KeycloakTokens refresh(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "refresh_token");
        form.add("client_id", properties.getClientId());
        form.add("refresh_token", refreshToken);
        Reply reply = post(properties.getTokenUri(), form);
        if (reply.refused()) {
            throw new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "Refresh token expired or revoked", null);
        }
        return reply.tokens();
    }

    /**
     * Ends the SSO session the refresh token belongs to, which also kills every refresh token of that session. A token
     * Keycloak already refuses means the session is already gone, so that counts as done.
     *
     * @throws ServiceUnavailableException when Keycloak cannot be reached or answers unexpectedly, i.e. the session may
     *         still be alive and the caller must not pretend otherwise
     */
    void endSession(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getClientId());
        form.add("refresh_token", refreshToken);
        post(properties.getLogoutUri(), form);
    }

    private Reply post(String uri, MultiValueMap<String, String> form) {
        try {
            return restClient.post()
                    .uri(uri)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .exchange((request, response) -> {
                        HttpStatusCode status = response.getStatusCode();
                        if (status.is2xxSuccessful()) {
                            // The end-session endpoint answers 204 with no body.
                            Map<?, ?> body = status.value() == 204 ? null : response.bodyTo(Map.class);
                            return new Reply(false, safeBody(body));
                        }
                        if (status.value() == 400) {
                            return new Reply(true, Map.of());
                        }
                        throw new ServiceUnavailableException("Keycloak answered " + status.value() + " for " + uri);
                    });
        } catch (ServiceUnavailableException e) {
            throw e;
        } catch (RestClientException e) {
            throw new ServiceUnavailableException("Keycloak is not reachable: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> safeBody(Map<?, ?> body) {
        return body == null ? Map.of() : (Map<String, Object>) body;
    }

    /** A 2xx reply with its JSON body, or a refusal (HTTP 400). */
    private record Reply(boolean refused, Map<String, Object> body) {

        KeycloakTokens tokens() {
            Object access = body.get("access_token");
            Object refresh = body.get("refresh_token");
            if (!(access instanceof String accessToken) || !(refresh instanceof String refreshToken)) {
                throw new ServiceUnavailableException("Keycloak's token reply carried no tokens");
            }
            return new KeycloakTokens(accessToken, refreshToken, number(body.get("expires_in")), number(body.get("refresh_expires_in")));
        }

        private static long number(Object value) {
            return value instanceof Number n ? n.longValue() : 0L;
        }
    }
}

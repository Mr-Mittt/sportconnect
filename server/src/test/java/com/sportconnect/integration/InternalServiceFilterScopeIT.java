package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression test for a real bug found and fixed 2026-07-27 (see {@code PROGRESS.md} and
 * {@code services/chat/docs/SYNC_DESIGN.md}): {@code InternalServiceAuthFilter} was originally a
 * {@code @Component}, and Spring Boot auto-registers <em>any</em> bean implementing {@code Filter}
 * as a global servlet filter regardless of which {@code SecurityFilterChain} it's also wired into
 * via {@code addFilterBefore(...)} — that auto-registered copy rejected every request in the
 * entire app, not just {@code /internal/**} ones.
 * <p>
 * This deliberately does <b>not</b> extend {@link BaseIT}: {@code BaseIT} runs under
 * {@code webEnvironment = MOCK} + {@code @AutoConfigureMockMvc}, and that combination does
 * <b>not</b> reproduce Boot's real global-filter auto-registration — confirmed empirically during
 * the same investigation that found this bug, an existing {@code MockMvc}-based test
 * ({@code GroupControllerTest}) passed while the bug was still live in the code. Catching this
 * class of regression genuinely requires a real embedded server ({@code RANDOM_PORT}) and a real
 * HTTP client, which is what this class is for.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class InternalServiceFilterScopeIT extends RedisTestContainerBase {

    @Value("${local.server.port}")
    private int port;

    @Value("${app.internal-service-secret}")
    private String internalServiceSecret;

    @Autowired
    private TestRestTemplate restTemplate;

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void publicEndpointIsReachableRegardlessOfTheInternalFilter() {
        ResponseEntity<String> response = restTemplate.getForEntity(url("/api/sports"), String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void internalEndpointRejectsAMissingSecret() {
        ResponseEntity<String> response =
                restTemplate.getForEntity(url("/internal/sync/group-members?limit=1"), String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertTrue(response.getBody().contains("Invalid or missing internal service secret"));
    }

    @Test
    void internalEndpointRejectsTheWrongSecret() {
        HttpEntity<Void> request = withSecretHeader("definitely-wrong");

        ResponseEntity<String> response = restTemplate.exchange(
                url("/internal/sync/group-members?limit=1"), HttpMethod.GET, request, String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void internalEndpointAcceptsTheCorrectSecret() {
        HttpEntity<Void> request = withSecretHeader(internalServiceSecret);

        ResponseEntity<String> response = restTemplate.exchange(
                url("/internal/sync/group-members?limit=1"), HttpMethod.GET, request, String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    private HttpEntity<Void> withSecretHeader(String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Service-Secret", secret);
        return new HttpEntity<>(headers);
    }
}

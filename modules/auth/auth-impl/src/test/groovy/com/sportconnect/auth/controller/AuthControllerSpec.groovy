package com.sportconnect.auth.controller

import com.sportconnect.auth.api.dto.AuthResponse
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.auth.config.CookieProperties
import com.sportconnect.common.exception.GlobalExceptionHandler
import org.springframework.http.HttpHeaders
import org.springframework.security.core.Authentication
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import spock.lang.Specification
import spock.lang.Subject

import static org.hamcrest.Matchers.containsString
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * No Spring context in this library module (same reasoning as GlobalExceptionHandlerSpec) —
 * standalone MockMvc against a hand-built AuthController. Covers A2 (refresh token moves to an
 * httpOnly cookie), A3 (logout) and A26/A28 (the Keycloak endpoints that remain). The actual SecurityConfig
 * authorization rule for POST /api/auth/logout is NOT exercised here — the "test" Spring profile
 * disables Spring Security auto-configuration entirely (see application-test.yml), so no test in
 * this repo currently runs the real filter chain. That rule is verified manually against a running
 * server (see A3's ticket summary).
 */
class AuthControllerSpec extends Specification {

    AuthService authService = Mock(AuthService)
    CookieProperties cookieProperties = new CookieProperties(secure: true)

    @Subject
    AuthController controller = new AuthController(authService, cookieProperties)

    MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .build()

    private static AuthResponse authResponse(String refreshToken) {
        AuthResponse.builder()
                .accessToken("access-token")
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(3600L)
                .user(Map.of("id", "user-1", "email", "test@example.com"))
                .build()
    }

    def "refresh sets the cookie attributes: httpOnly, Secure, SameSite=Strict, scoped to /api/auth, Max-Age from Keycloak"() {
        given:
        authService.refreshToken("old-refresh-token") >> authResponse("raw-refresh-token").tap { it.refreshTokenMaxAgeSeconds = 1800L }

        expect:
        mockMvc.perform(post("/api/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refreshToken", "old-refresh-token")))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "raw-refresh-token"))
                .andExpect(cookie().httpOnly("refreshToken", true))
                .andExpect(cookie().secure("refreshToken", true))
                .andExpect(cookie().path("refreshToken", "/api/auth"))
                .andExpect(cookie().maxAge("refreshToken", 1800))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("SameSite=Strict")))
                .andExpect(jsonPath('$.data.accessToken').value("access-token"))
                .andExpect(jsonPath('$.data.refreshToken').doesNotExist())
    }

    def "a response without a Keycloak lifetime sets a browser-session cookie (no Max-Age)"() {
        given:
        authService.refreshToken("old-refresh-token") >> authResponse("raw-refresh-token")

        expect:
        mockMvc.perform(post("/api/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refreshToken", "old-refresh-token")))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.not(containsString("Max-Age"))))
    }

    def "cookie Secure attribute follows CookieProperties (off in dev)"() {
        given: "a controller wired with the dev-profile-equivalent property"
        def devMockMvc = MockMvcBuilders.standaloneSetup(new AuthController(authService, new CookieProperties(secure: false)))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build()
        authService.refreshToken("old-refresh-token") >> authResponse("raw-refresh-token")

        expect:
        devMockMvc.perform(post("/api/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refreshToken", "old-refresh-token")))
                .andExpect(cookie().secure("refreshToken", false))
    }

    def "the removed endpoints are gone"() {
        expect:
        mockMvc.perform(post(path).contentType("application/json").content('{}')).andExpect(status().isNotFound())

        where:
        path << ["/api/auth/register", "/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password",
                 "/api/auth/reset-password/validate", "/api/auth/verify-email", "/api/auth/oauth-token"]
    }

    def "refresh reads the token from the cookie, calls the service, and rotates the cookie"() {
        given:
        authService.refreshToken("old-refresh-token") >> authResponse("new-refresh-token")

        expect:
        mockMvc.perform(post("/api/auth/refresh").cookie(new jakarta.servlet.http.Cookie("refreshToken", "old-refresh-token")))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "new-refresh-token"))
                .andExpect(jsonPath('$.data.refreshToken').doesNotExist())
    }

    def "refresh without a cookie returns 401 and never calls the service"() {
        when:
        def result = mockMvc.perform(post("/api/auth/refresh"))

        then:
        result.andExpect(status().isUnauthorized())
              .andExpect(jsonPath('$.errorCode').value("REFRESH_TOKEN_MISSING"))
        0 * authService.refreshToken(_)
    }

    def "logout ends the Keycloak session of the cookie's refresh token and clears the cookie, with no principal needed"() {
        when:
        def result = mockMvc.perform(post("/api/auth/logout").cookie(new jakarta.servlet.http.Cookie("refreshToken", "the-refresh-token")))

        then:
        result.andExpect(status().isOk())
                .andExpect(cookie().maxAge("refreshToken", 0))
        1 * authService.endSession("the-refresh-token")
    }

    def "logout without a cookie is a 200 that still clears the cookie and calls nothing"() {
        when:
        def result = mockMvc.perform(post("/api/auth/logout"))

        then:
        result.andExpect(status().isOk())
                .andExpect(cookie().maxAge("refreshToken", 0))
        0 * authService.endSession(_)
    }

    def "logout leaves the cookie alone and answers 503 when Keycloak cannot end the session"() {
        given:
        authService.endSession("the-refresh-token") >> { throw new com.sportconnect.common.exception.ServiceUnavailableException("down") }

        when:
        def result = mockMvc.perform(post("/api/auth/logout").cookie(new jakarta.servlet.http.Cookie("refreshToken", "the-refresh-token")))

        then:
        result.andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath('$.errorCode').value("SERVICE_UNAVAILABLE"))
                .andExpect(cookie().doesNotExist("refreshToken"))
    }

    def "callback sets the cookie from the response's refresh token, with Max-Age taken from Keycloak"() {
        given:
        authService.callback("the-code", "v" * 43) >> authResponse("kc-refresh").tap { it.refreshTokenMaxAgeSeconds = 86400L }

        expect:
        mockMvc.perform(post("/api/auth/callback").contentType("application/json")
                .content('{"code":"the-code","codeVerifier":"' + ("v" * 43) + '"}'))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "kc-refresh"))
                .andExpect(cookie().maxAge("refreshToken", 86400))
                .andExpect(cookie().httpOnly("refreshToken", true))
                .andExpect(jsonPath('$.data.refreshToken').doesNotExist())
    }

    def "callback rejects a body without a verifier before the service is called"() {
        when:
        def result = mockMvc.perform(post("/api/auth/callback").contentType("application/json").content('{"code":"abc"}'))

        then:
        result.andExpect(status().isBadRequest())
        0 * authService.callback(_, _)
    }

    def "reactivate takes the ticket, not credentials, and sets the cookie"() {
        given:
        authService.reactivate("the-ticket") >> authResponse("kc-refresh")

        expect:
        mockMvc.perform(post("/api/auth/reactivate").contentType("application/json").content('{"ticket":"the-ticket"}'))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "kc-refresh"))
    }

    def "reactivate/cancel always answers 200 and passes the ticket on"() {
        when:
        def result = mockMvc.perform(post("/api/auth/reactivate/cancel").contentType("application/json").content('{"ticket":"the-ticket"}'))

        then:
        result.andExpect(status().isOk())
        1 * authService.cancelReactivation("the-ticket")
    }
}

package com.sportconnect.auth.controller

import com.sportconnect.auth.api.dto.AuthResponse
import com.sportconnect.auth.api.dto.LoginRequest
import com.sportconnect.auth.api.dto.RegisterRequest
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.auth.config.CookieProperties
import com.sportconnect.auth.config.JwtProperties
import com.sportconnect.auth.service.EmailVerificationService
import com.sportconnect.auth.service.PasswordResetService
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
 * httpOnly cookie) and A3 (logout derives the user from the principal). The actual SecurityConfig
 * authorization rule for POST /api/auth/logout is NOT exercised here — the "test" Spring profile
 * disables Spring Security auto-configuration entirely (see application-test.yml), so no test in
 * this repo currently runs the real filter chain. That rule is verified manually against a running
 * server (see A3's ticket summary).
 */
class AuthControllerSpec extends Specification {

    AuthService authService = Mock(AuthService)
    EmailVerificationService emailVerificationService = Mock(EmailVerificationService)
    PasswordResetService passwordResetService = Mock(PasswordResetService)
    CookieProperties cookieProperties = new CookieProperties(secure: true)
    JwtProperties jwtProperties = new JwtProperties(refreshExpiration: 604_800_000L) // 7 days, ms

    @Subject
    AuthController controller = new AuthController(
            authService, emailVerificationService, passwordResetService, cookieProperties, jwtProperties)

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

    def "login sets the refresh cookie and omits refreshToken from the response body"() {
        given:
        authService.login(_) >> authResponse("raw-refresh-token")

        expect:
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content('{"email":"test@example.com","password":"password123"}'))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "raw-refresh-token"))
                .andExpect(cookie().httpOnly("refreshToken", true))
                .andExpect(cookie().secure("refreshToken", true))
                .andExpect(cookie().path("refreshToken", "/api/auth"))
                .andExpect(cookie().maxAge("refreshToken", 604_800))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("SameSite=Strict")))
                .andExpect(jsonPath('$.data.accessToken').value("access-token"))
                .andExpect(jsonPath('$.data.refreshToken').doesNotExist())
    }

    def "register sets the refresh cookie and omits refreshToken from the response body"() {
        given:
        authService.register(_) >> authResponse("raw-refresh-token")

        expect:
        mockMvc.perform(post("/api/auth/register")
                        .contentType("application/json")
                        .content('{"email":"test@example.com","password":"password123","fullName":"Test User"}'))
                .andExpect(status().isOk())
                .andExpect(cookie().value("refreshToken", "raw-refresh-token"))
                .andExpect(jsonPath('$.data.refreshToken').doesNotExist())
    }

    def "cookie Secure attribute follows CookieProperties (off in dev)"() {
        given: "a controller wired with the dev-profile-equivalent property"
        def devController = new AuthController(
                authService, emailVerificationService, passwordResetService,
                new CookieProperties(secure: false), jwtProperties)
        def devMockMvc = MockMvcBuilders.standaloneSetup(devController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build()
        authService.login(_) >> authResponse("raw-refresh-token")

        expect:
        devMockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content('{"email":"test@example.com","password":"password123"}'))
                .andExpect(cookie().secure("refreshToken", false))
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
        0 * authService.refreshToken(_)
    }

    def "logout derives the user from the principal, revokes their session, and clears the cookie"() {
        given:
        def userId = UUID.randomUUID()
        Authentication authentication = Stub(Authentication) {
            isAuthenticated() >> true
            getPrincipal() >> userId.toString()
        }

        when:
        def result = mockMvc.perform(post("/api/auth/logout").principal(authentication))

        then:
        result.andExpect(status().isOk())
                .andExpect(cookie().maxAge("refreshToken", 0))
        1 * authService.logout(userId)
    }
}

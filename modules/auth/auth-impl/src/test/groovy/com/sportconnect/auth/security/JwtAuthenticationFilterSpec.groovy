package com.sportconnect.auth.security

import com.sportconnect.auth.api.service.JwtTokenService
import com.sportconnect.auth.service.TokenRevocationChecker
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant

class JwtAuthenticationFilterSpec extends Specification {

    JwtTokenService jwtTokenService
    TokenRevocationChecker tokenRevocationChecker

    @Subject
    JwtAuthenticationFilter jwtAuthenticationFilter

    def setup() {
        jwtTokenService = Mock(JwtTokenService)
        tokenRevocationChecker = Mock(TokenRevocationChecker)
        jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtTokenService, tokenRevocationChecker)
        SecurityContextHolder.clearContext()
    }

    def cleanup() {
        SecurityContextHolder.clearContext()
    }

    def "should set authentication when valid JWT token is provided"() {
        given: "a valid JWT token"
        def token = "valid.jwt.token"
        def userId = UUID.randomUUID().toString()
        def email = "test@example.com"
        def roles = ["USER"]
        
        and: "a request with Authorization header"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "Bearer " + token)
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()
        
        and: "jwt service validates and extracts data"
        jwtTokenService.validateToken(token) >> true
        jwtTokenService.getUserIdFromToken(token) >> userId
        jwtTokenService.getIssuedAtFromToken(token) >> Instant.now()
        jwtTokenService.getEmailFromToken(token) >> email
        jwtTokenService.getAuthoritiesFromToken(token) >> roles

        and: "the token has not been revoked"
        tokenRevocationChecker.isRevoked(_, _) >> false

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should be set in security context"
        def authentication = SecurityContextHolder.getContext().getAuthentication()
        authentication != null
        // Principal is the userId, not the email — SecurityUtils.extractUserId() across the app
        // (GroupController, PostController, AuthController's own logout, etc.) parses the
        // principal as a UUID; this assertion was stale from before that convention landed.
        authentication.principal == userId
        authentication.authorities.size() == 1
        authentication.authorities[0].authority == "ROLE_USER"
    }

    // U12
    def "should not set authentication when token is revoked"() {
        given: "a valid, but revoked, JWT token"
        def token = "valid.jwt.token"
        def userId = UUID.randomUUID().toString()

        and: "a request with Authorization header"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "Bearer " + token)
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        and: "jwt service validates the token, but it was issued before the user's revocation watermark"
        jwtTokenService.validateToken(token) >> true
        jwtTokenService.getUserIdFromToken(token) >> userId
        jwtTokenService.getIssuedAtFromToken(token) >> Instant.now()
        tokenRevocationChecker.isRevoked(_, _) >> true

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should not be set"
        SecurityContextHolder.getContext().getAuthentication() == null

        and: "the authorities/email claims are never even read for a revoked token"
        0 * jwtTokenService.getAuthoritiesFromToken(_)
    }

    def "should not set authentication when token is invalid"() {
        given: "an invalid JWT token"
        def token = "invalid.jwt.token"
        
        and: "a request with Authorization header"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "Bearer " + token)
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()
        
        and: "jwt service rejects token"
        jwtTokenService.validateToken(token) >> false

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should not be set"
        SecurityContextHolder.getContext().getAuthentication() == null
    }

    def "should not set authentication when no Authorization header"() {
        given: "a request without Authorization header"
        def request = new MockHttpServletRequest()
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should not be set"
        SecurityContextHolder.getContext().getAuthentication() == null
        
        and: "jwt service should not be called"
        0 * jwtTokenService.validateToken(_)
    }

    def "should not set authentication when Authorization header is malformed"() {
        given: "a request with malformed Authorization header"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "InvalidFormat token")
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should not be set"
        SecurityContextHolder.getContext().getAuthentication() == null
        
        and: "jwt service should not be called"
        0 * jwtTokenService.validateToken(_)
    }

    def "should handle multiple roles correctly"() {
        given: "a valid JWT token with multiple roles"
        def token = "valid.jwt.token"
        def userId = UUID.randomUUID().toString()
        def email = "admin@example.com"
        def roles = ["USER", "ADMIN", "MODERATOR"]
        
        and: "a request with Authorization header"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "Bearer " + token)
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()
        
        and: "jwt service validates and extracts data"
        jwtTokenService.validateToken(token) >> true
        jwtTokenService.getUserIdFromToken(token) >> userId
        jwtTokenService.getIssuedAtFromToken(token) >> Instant.now()
        jwtTokenService.getEmailFromToken(token) >> email
        jwtTokenService.getAuthoritiesFromToken(token) >> roles

        and: "the token has not been revoked"
        tokenRevocationChecker.isRevoked(_, _) >> false

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "authentication should have all roles with ROLE_ prefix"
        def authentication = SecurityContextHolder.getContext().getAuthentication()
        authentication != null
        authentication.authorities.size() == 3
        authentication.authorities*.authority.containsAll(["ROLE_USER", "ROLE_ADMIN", "ROLE_MODERATOR"])
    }

    def "should continue filter chain even when exception occurs"() {
        given: "a request that causes exception"
        def request = new MockHttpServletRequest()
        request.addHeader("Authorization", "Bearer valid.token")
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()
        
        and: "jwt service throws exception"
        jwtTokenService.validateToken(_) >> { throw new RuntimeException("Token processing error") }

        when: "filter processes request"
        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain)

        then: "should not throw exception and continue chain"
        noExceptionThrown()
        SecurityContextHolder.getContext().getAuthentication() == null
    }
}

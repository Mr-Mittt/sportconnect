package com.sportconnect.auth.security

import com.sportconnect.user.api.dto.UserAccessState
import com.sportconnect.user.api.service.UserService
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant

/** A25: the filter turns a verified Keycloak token plus the cached account state into an authentication. */
class JwtAuthenticationFilterSpec extends Specification {

    JwtDecoder jwtDecoder = Mock()
    UserService userService = Mock()

    @Subject
    JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtDecoder, userService)

    MockHttpServletRequest request = new MockHttpServletRequest()
    MockHttpServletResponse response = new MockHttpServletResponse()
    MockFilterChain chain = new MockFilterChain()

    def setup() {
        SecurityContextHolder.clearContext()
        request.addHeader("Authorization", "Bearer some.token")
    }

    def cleanup() {
        SecurityContextHolder.clearContext()
    }

    private static Jwt jwt(String sub) {
        Jwt.withTokenValue("t").header("alg", "RS256").subject(sub)
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build()
    }

    def "an active user is authenticated with the roles from the database, principal = sub"() {
        given:
        def id = UUID.randomUUID()

        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode("some.token") >> jwt(id.toString())
        1 * userService.getAccessState(id) >> Optional.of(new UserAccessState(true, ["USER", "ADMIN"]))
        def auth = SecurityContextHolder.context.authentication
        auth.principal == id.toString()
        auth.authorities*.authority as Set == ["ROLE_USER", "ROLE_ADMIN"] as Set
        chain.request != null
    }

    def "a deactivated user stays anonymous"() {
        given:
        def id = UUID.randomUUID()

        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> jwt(id.toString())
        1 * userService.getAccessState(id) >> Optional.of(new UserAccessState(false, ["USER"]))
        SecurityContextHolder.context.authentication == null
        chain.request != null
        request.getAttribute(JwtAuthenticationFilter.FAILURE_ATTRIBUTE) == null
    }

    def "a sub that was never provisioned stays anonymous"() {
        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> jwt(UUID.randomUUID().toString())
        1 * userService.getAccessState(_) >> Optional.empty()
        SecurityContextHolder.context.authentication == null
    }

    def "a token the decoder rejects stays anonymous and never reaches the user lookup"() {
        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> { throw new BadJwtException("expired") }
        0 * userService._
        SecurityContextHolder.context.authentication == null
        request.getAttribute(JwtAuthenticationFilter.FAILURE_ATTRIBUTE) == null
        chain.request != null
    }

    def "a sub that is not a UUID is rejected"() {
        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> jwt(sub)
        0 * userService._
        SecurityContextHolder.context.authentication == null

        where:
        sub << ["not-a-uuid", "", null]
    }

    def "an unreachable key set is a 503 marker, not a plain 401"() {
        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> { throw new JwtException("Couldn't retrieve remote JWK set") }
        SecurityContextHolder.context.authentication == null
        request.getAttribute(JwtAuthenticationFilter.FAILURE_ATTRIBUTE) == HttpStatus.SERVICE_UNAVAILABLE
        chain.request != null
    }

    def "a failing user lookup is a 500 marker, not a silent 401 (A14)"() {
        when:
        filter.doFilterInternal(request, response, chain)

        then:
        1 * jwtDecoder.decode(_) >> jwt(UUID.randomUUID().toString())
        1 * userService.getAccessState(_) >> { throw new IllegalStateException("db down") }
        SecurityContextHolder.context.authentication == null
        request.getAttribute(JwtAuthenticationFilter.FAILURE_ATTRIBUTE) == HttpStatus.INTERNAL_SERVER_ERROR
    }

    def "a request without a bearer token is passed on untouched"() {
        given:
        def bare = new MockHttpServletRequest()

        when:
        filter.doFilterInternal(bare, response, chain)

        then:
        0 * jwtDecoder._
        0 * userService._
        chain.request != null
    }

    def "an exception thrown further down the chain is not swallowed"() {
        given:
        def failing = Mock(jakarta.servlet.FilterChain)
        failing.doFilter(_, _) >> { throw new IllegalStateException("controller bug") }

        when:
        filter.doFilterInternal(request, response, failing)

        then:
        1 * jwtDecoder.decode(_) >> jwt(UUID.randomUUID().toString())
        1 * userService.getAccessState(_) >> Optional.of(new UserAccessState(true, ["USER"]))
        thrown(IllegalStateException)
    }
}

package com.sportconnect.auth.service

import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant

/**
 * A25, A28: reads a Keycloak token through the JwtDecoder (mocked here, the real decoder is exercised by
 * KeycloakResourceServerIntegrationTest). There is no minting any more.
 */
class JwtTokenServiceImplSpec extends Specification {

    JwtDecoder jwtDecoder = Mock()

    @Subject
    JwtTokenServiceImpl jwtTokenService

    def setup() {
        jwtTokenService = new JwtTokenServiceImpl(jwtDecoder)
    }

    private static Jwt jwt(Map claims, Instant expiresAt = Instant.now().plusSeconds(300)) {
        Jwt.withTokenValue("t").header("alg", "RS256").claims { it.putAll(claims) }
                .issuedAt(expiresAt.minusSeconds(600)).expiresAt(expiresAt).build()
    }

    // ---- reading (Keycloak, via the decoder) ----

    def "validateToken is true when the decoder accepts the token"() {
        given:
        jwtDecoder.decode("good") >> jwt([sub: "u"])

        expect:
        jwtTokenService.validateToken("good")
    }

    def "validateToken is false for anything the decoder rejects or cannot check"() {
        given:
        jwtDecoder.decode("bad") >> { throw new BadJwtException("nope") }
        jwtDecoder.decode("nokeys") >> { throw new JwtException("jwks down") }

        expect:
        !jwtTokenService.validateToken("bad")
        !jwtTokenService.validateToken("nokeys")
    }

    def "the user id is the sub claim, the email is nullable, roles are never read from the token"() {
        given:
        def id = UUID.randomUUID().toString()
        jwtDecoder.decode("with-email") >> jwt([sub: id, email: "k@example.com", roles: ["ADMIN"]])
        jwtDecoder.decode("no-email") >> jwt([sub: id])

        expect:
        jwtTokenService.getUserIdFromToken("with-email") == id
        jwtTokenService.getEmailFromToken("with-email") == "k@example.com"
        jwtTokenService.getEmailFromToken("no-email") == null
        jwtTokenService.getAuthoritiesFromToken("with-email").isEmpty()
    }

    def "getIssuedAtFromToken returns iat"() {
        given:
        def expiresAt = Instant.parse("2030-01-01T00:10:00Z")
        jwtDecoder.decode("t") >> jwt([sub: "u"], expiresAt)

        expect:
        jwtTokenService.getIssuedAtFromToken("t") == Instant.parse("2030-01-01T00:00:00Z")
    }

    def "isTokenExpired is false for a live token and true for an expired or rejected one"() {
        given:
        jwtDecoder.decode("live") >> jwt([sub: "u"], Instant.now().plusSeconds(60))
        jwtDecoder.decode("past") >> jwt([sub: "u"], Instant.now().minusSeconds(60))
        jwtDecoder.decode("bad") >> { throw new BadJwtException("expired") }

        expect:
        !jwtTokenService.isTokenExpired("live")
        jwtTokenService.isTokenExpired("past")
        jwtTokenService.isTokenExpired("bad")
    }
}

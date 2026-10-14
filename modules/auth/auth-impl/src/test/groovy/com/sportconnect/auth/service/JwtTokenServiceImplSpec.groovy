package com.sportconnect.auth.service

import com.sportconnect.auth.config.JwtProperties
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import spock.lang.Specification
import spock.lang.Subject

import java.nio.charset.StandardCharsets
import java.time.Instant

/**
 * A25: the minting half is still the legacy HS256 token (checked with jjwt directly); the reading half verifies a
 * Keycloak token through the JwtDecoder (mocked here, the real decoder is exercised by KeycloakResourceServerIntegrationTest).
 */
class JwtTokenServiceImplSpec extends Specification {

    private static final String SECRET = "test-secret-key-for-jwt-token-generation-minimum-256-bits-required-for-hmac-sha"

    JwtProperties jwtProperties
    JwtDecoder jwtDecoder = Mock()

    @Subject
    JwtTokenServiceImpl jwtTokenService

    def setup() {
        jwtProperties = new JwtProperties()
        jwtProperties.secret = SECRET
        jwtProperties.expiration = 3600000L // 1 hour
        jwtProperties.refreshExpiration = 604800000L // 7 days

        jwtTokenService = new JwtTokenServiceImpl(jwtProperties, jwtDecoder)
    }

    private static Jwt jwt(Map claims, Instant expiresAt = Instant.now().plusSeconds(300)) {
        Jwt.withTokenValue("t").header("alg", "RS256").claims { it.putAll(claims) }
                .issuedAt(expiresAt.minusSeconds(600)).expiresAt(expiresAt).build()
    }

    // ---- minting (legacy, HS256) ----

    def "should generate an HS256 access token carrying the user's claims"() {
        given:
        def id = UUID.randomUUID()
        def userData = [id: id, email: "test@example.com", username: "testuser", roles: ["USER"]]

        when:
        def token = jwtTokenService.generateAccessToken(userData)

        then:
        def claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(token).getPayload()
        claims.getSubject() == id.toString()
        claims.get("email") == "test@example.com"
        claims.get("roles") == ["USER"]
    }

    def "should generate refresh token for user"() {
        when:
        def token = jwtTokenService.generateRefreshToken([id: UUID.randomUUID(), email: "a@b.c", username: "u", roles: ["USER"]])

        then:
        token != null
        token.length() > 0
    }

    def "should generate a unique token on every call, even for the same user within the same second"() {
        given:
        def userData = [id: UUID.randomUUID(), email: "test@example.com", username: "testuser", roles: ["USER"]]

        when:
        def tokenOne = jwtTokenService.generateRefreshToken(userData)
        def tokenTwo = jwtTokenService.generateRefreshToken(userData)

        then: "the tokens differ despite identical claims (jti makes them unique)"
        tokenOne != tokenTwo
    }

    def "should return refresh expiration time"() {
        expect:
        jwtTokenService.getRefreshExpiration() == 604800000L
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

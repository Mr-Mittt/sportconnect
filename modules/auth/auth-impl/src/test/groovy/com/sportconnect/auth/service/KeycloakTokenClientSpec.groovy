package com.sportconnect.auth.service

import com.sportconnect.auth.config.KeycloakProperties
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sportconnect.common.exception.UnauthorizedException
import com.sun.net.httpserver.HttpServer
import spock.lang.Shared
import spock.lang.Specification

import java.nio.charset.StandardCharsets

/**
 * A26: the backend's calls to Keycloak's token and end-session endpoints, against a tiny local HTTP server so the real
 * {@code RestClient} request (form encoding, status handling, timeouts) is what runs.
 */
class KeycloakTokenClientSpec extends Specification {

    @Shared HttpServer server
    @Shared int port
    @Shared volatile int tokenStatus = 200
    @Shared volatile String tokenBody = '{"access_token":"a","refresh_token":"r","expires_in":300,"refresh_expires_in":86400}'
    @Shared volatile int logoutStatus = 204
    @Shared volatile String lastTokenForm
    @Shared volatile String lastLogoutForm

    KeycloakTokenClient client

    def setupSpec() {
        server = HttpServer.create(new InetSocketAddress(InetAddress.loopbackAddress, 0), 0)
        server.createContext("/token") { ex ->
            lastTokenForm = new String(ex.requestBody.readAllBytes(), StandardCharsets.UTF_8)
            byte[] body = tokenBody.getBytes(StandardCharsets.UTF_8)
            ex.responseHeaders.add("Content-Type", "application/json")
            ex.sendResponseHeaders(tokenStatus, body.length)
            ex.responseBody.write(body)
            ex.close()
        }
        server.createContext("/logout") { ex ->
            lastLogoutForm = new String(ex.requestBody.readAllBytes(), StandardCharsets.UTF_8)
            ex.sendResponseHeaders(logoutStatus, -1)
            ex.close()
        }
        server.start()
        port = server.address.port
    }

    def cleanupSpec() {
        server.stop(0)
    }

    def setup() {
        tokenStatus = 200
        tokenBody = '{"access_token":"a","refresh_token":"r","expires_in":300,"refresh_expires_in":86400}'
        logoutStatus = 204
        client = clientFor(port)
    }

    private static KeycloakTokenClient clientFor(int p) {
        def props = new KeycloakProperties()
        props.clientId = "sportconnect-web"
        props.redirectUri = "http://localhost:5173/auth/callback"
        props.tokenUri = "http://127.0.0.1:${p}/token"
        props.logoutUri = "http://127.0.0.1:${p}/logout"
        new KeycloakTokenClient(props)
    }

    def "exchangeCode posts the authorization-code grant with the verifier and the exact redirect uri, and reads the tokens"() {
        when:
        def tokens = client.exchangeCode("the code", "the-verifier")

        then:
        tokens == new KeycloakTokens("a", "r", 300L, 86400L)
        lastTokenForm.contains("grant_type=authorization_code")
        lastTokenForm.contains("client_id=sportconnect-web")
        lastTokenForm.contains("code=the+code")
        lastTokenForm.contains("code_verifier=the-verifier")
        lastTokenForm.contains("redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback")
    }

    def "refresh posts the refresh-token grant"() {
        when:
        client.refresh("old-refresh")

        then:
        lastTokenForm.contains("grant_type=refresh_token")
        lastTokenForm.contains("refresh_token=old-refresh")
        lastTokenForm.contains("client_id=sportconnect-web")
    }

    def "a 400 from Keycloak is AUTH_CODE_INVALID for a code and REFRESH_TOKEN_EXPIRED_OR_REVOKED for a refresh"() {
        given:
        tokenStatus = 400
        tokenBody = '{"error":"invalid_grant"}'

        when:
        client.exchangeCode("c", "v")

        then:
        def e1 = thrown(UnauthorizedException)
        e1.errorCode == "AUTH_CODE_INVALID"
        when:
        client.refresh("r")

        then:
        def e2 = thrown(UnauthorizedException)
        e2.errorCode == "REFRESH_TOKEN_EXPIRED_OR_REVOKED"
    }

    def "a server error, or a 401 that means this app is misconfigured, is ServiceUnavailable, never the user's fault"() {
        given:
        tokenStatus = status
        tokenBody = '{}'

        when:
        client.exchangeCode("c", "v")

        then:
        thrown(ServiceUnavailableException)

        where:
        status << [500, 502, 503, 401, 403]
    }

    def "a reply without tokens is ServiceUnavailable"() {
        given:
        tokenBody = '{"unexpected":true}'

        when:
        client.exchangeCode("c", "v")

        then:
        thrown(ServiceUnavailableException)
    }

    def "an unreachable Keycloak is ServiceUnavailable"() {
        given:
        def dead = clientFor(1) // nothing listens on port 1

        when:
        dead.refresh("r")

        then:
        thrown(ServiceUnavailableException)
    }

    def "endSession posts the refresh token to the end-session endpoint"() {
        when:
        client.endSession("the-refresh")

        then:
        noExceptionThrown()
        lastLogoutForm.contains("refresh_token=the-refresh")
        lastLogoutForm.contains("client_id=sportconnect-web")
    }

    def "endSession treats a token Keycloak already refuses (400) as done, but not a server error"() {
        when:
        logoutStatus = 400
        client.endSession("r")

        then:
        noExceptionThrown()

        when:
        logoutStatus = 500
        client.endSession("r")

        then:
        thrown(ServiceUnavailableException)
    }
}

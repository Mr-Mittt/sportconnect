package com.sportconnect.auth.service

import com.sportconnect.auth.config.KeycloakProperties
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import spock.lang.Shared
import spock.lang.Specification

import java.nio.charset.StandardCharsets

/**
 * U24: the password check and the password set, as the confidential client {@code sportconnect-credentials}, against a
 * tiny local HTTP server so the real {@code RestClient} requests (form encoding, bearer header, status handling) run.
 */
class KeycloakCredentialServiceImplSpec extends Specification {

    static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111")

    @Shared HttpServer server
    @Shared int port
    @Shared volatile int tokenStatus = 200
    @Shared volatile String tokenBody = '{"access_token":"svc","expires_in":60}'
    @Shared volatile int passwordGrantStatus = 200
    @Shared volatile String passwordGrantBody = '{"access_token":"x","refresh_token":"y"}'
    @Shared volatile int lookupStatus = 200
    @Shared volatile String lookupBody = '{"id":"11111111-1111-1111-1111-111111111111","username":"jordan"}'
    @Shared volatile int resetStatus = 204
    @Shared volatile String lastTokenForm
    @Shared volatile String lastPasswordForm
    @Shared volatile String lastLookupAuth
    @Shared volatile String lastResetAuth
    @Shared volatile String lastResetBody
    @Shared volatile String lastResetPath
    @Shared volatile String lastResetQuery

    KeycloakCredentialServiceImpl service

    def setupSpec() {
        server = HttpServer.create(new InetSocketAddress(InetAddress.loopbackAddress, 0), 0)
        server.createContext("/token") { HttpExchange ex ->
            String form = new String(ex.requestBody.readAllBytes(), StandardCharsets.UTF_8)
            if (form.contains("grant_type=password")) {
                lastPasswordForm = form
                reply(ex, passwordGrantStatus, passwordGrantBody)
            } else {
                lastTokenForm = form
                reply(ex, tokenStatus, tokenBody)
            }
        }
        server.createContext("/admin/users") { HttpExchange ex ->
            String path = ex.requestURI.path
            if (ex.requestMethod == "PUT") {
                lastResetAuth = ex.requestHeaders.getFirst("Authorization")
                lastResetPath = path
                lastResetQuery = ex.requestURI.rawQuery
                lastResetBody = new String(ex.requestBody.readAllBytes(), StandardCharsets.UTF_8)
                reply(ex, resetStatus, "")
            } else {
                lastLookupAuth = ex.requestHeaders.getFirst("Authorization")
                reply(ex, lookupStatus, lookupBody)
            }
        }
        server.start()
        port = server.address.port
    }

    def cleanupSpec() {
        server.stop(0)
    }

    def setup() {
        tokenStatus = 200
        tokenBody = '{"access_token":"svc","expires_in":60}'
        passwordGrantStatus = 200
        passwordGrantBody = '{"access_token":"x","refresh_token":"y"}'
        lookupStatus = 200
        lookupBody = '{"id":"11111111-1111-1111-1111-111111111111","username":"jordan"}'
        resetStatus = 204
        service = serviceFor(port)
    }

    private static void reply(HttpExchange ex, int status, String json) {
        byte[] body = json.getBytes(StandardCharsets.UTF_8)
        ex.responseHeaders.add("Content-Type", "application/json")
        ex.sendResponseHeaders(status, body.length == 0 ? -1 : body.length)
        if (body.length > 0) {
            ex.responseBody.write(body)
        }
        ex.close()
    }

    private static KeycloakCredentialServiceImpl serviceFor(int p) {
        def props = new KeycloakProperties()
        props.tokenUri = "http://127.0.0.1:${p}/token"
        props.adminUri = "http://127.0.0.1:${p}/admin"
        props.clientId = "sportconnect-web"
        props.redirectUri = "http://localhost:5173/auth/callback"
        props.credentialsClientId = "sportconnect-credentials"
        props.credentialsClientSecret = "s3cret"
        new KeycloakCredentialServiceImpl(props)
    }

    // ── verifyPassword ───────────────────────────────────────────────────────

    def "verifyPassword looks the username up with the service token and sends a password grant as the credentials client"() {
        when:
        def ok = service.verifyPassword(USER_ID, "p@ss word")

        then:
        ok
        lastTokenForm.contains("grant_type=client_credentials")
        lastTokenForm.contains("client_id=sportconnect-credentials")
        lastTokenForm.contains("client_secret=s3cret")
        lastLookupAuth == "Bearer svc"
        lastPasswordForm.contains("grant_type=password")
        lastPasswordForm.contains("client_id=sportconnect-credentials")
        lastPasswordForm.contains("username=jordan")
        lastPasswordForm.contains("password=p%40ss+word")
    }

    def "verifyPassword answers false when Keycloak says the credentials are invalid (wrong password or none set)"() {
        given:
        passwordGrantStatus = status
        passwordGrantBody = '{"error":"invalid_grant","error_description":"Invalid user credentials"}'

        expect:
        !service.verifyPassword(USER_ID, "wrong")

        where:
        status << [400, 401]
    }

    def "verifyPassword answers false without asking when the password is empty or Keycloak has no such user"() {
        given:
        lookupStatus = 404
        lookupBody = '{"error":"User not found"}'
        lastPasswordForm = null

        expect:
        !service.verifyPassword(USER_ID, "anything")
        !service.verifyPassword(USER_ID, "")
        !service.verifyPassword(USER_ID, null)
        lastPasswordForm == null
    }

    def "verifyPassword is a 503, never a wrong-password answer, when this app's own credentials are refused or Keycloak fails"() {
        given:
        passwordGrantStatus = status
        passwordGrantBody = body

        when:
        service.verifyPassword(USER_ID, "secret")

        then:
        thrown(ServiceUnavailableException)

        where:
        status | body
        401    | '{"error":"invalid_client"}'
        500    | '{}'
        400    | '{"error":"unsupported_grant_type"}'
    }

    def "verifyPassword is a 503 when the service account cannot get a token or the lookup fails"() {
        when:
        tokenStatus = 401
        tokenBody = '{"error":"invalid_client"}'
        service.verifyPassword(USER_ID, "secret")

        then:
        thrown(ServiceUnavailableException)

        when:
        tokenStatus = 200
        tokenBody = '{"access_token":"svc"}'
        lookupStatus = 403
        lookupBody = '{}'
        service.verifyPassword(USER_ID, "secret")

        then:
        thrown(ServiceUnavailableException)
    }

    def "any call is a 503 when Keycloak is unreachable"() {
        given:
        def down = serviceFor(1)

        when:
        down.verifyPassword(USER_ID, "secret")

        then:
        thrown(ServiceUnavailableException)

        when:
        down.setPassword(USER_ID, "newSecret1")

        then:
        thrown(ServiceUnavailableException)
    }

    // ── setPassword ──────────────────────────────────────────────────────────

    def "setPassword puts a permanent password credential for the user with the service token"() {
        when:
        service.setPassword(USER_ID, "newSecret1")

        then:
        lastResetPath == "/admin/users/${USER_ID}/reset-password"
        lastResetAuth == "Bearer svc"
        lastResetBody.contains('"type":"password"')
        lastResetBody.contains('"value":"newSecret1"')
        lastResetBody.contains('"temporary":false')
    }

    def "setPassword turns a policy rejection into NEW_PASSWORD_REJECTED"() {
        given:
        resetStatus = 400

        when:
        service.setPassword(USER_ID, "short")

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "NEW_PASSWORD_REJECTED"
    }

    def "setPassword maps an unknown Keycloak user to not-found and any other failure to a 503"() {
        when:
        resetStatus = 404
        service.setPassword(USER_ID, "newSecret1")

        then:
        thrown(ResourceNotFoundException)

        when:
        resetStatus = 403
        service.setPassword(USER_ID, "newSecret1")

        then:
        thrown(ServiceUnavailableException)
    }

    // ── A33: email verification ──────────────────────────────────────

    def "isEmailVerified reads Keycloak's emailVerified flag with the service token"() {
        given:
        lookupBody = body

        expect:
        service.isEmailVerified(USER_ID) == expected
        lastLookupAuth == "Bearer svc"

        where:
        body                                            || expected
        '{"username":"jordan","emailVerified":true}'    || true
        '{"username":"jordan","emailVerified":false}'   || false
        '{"username":"jordan"}'                         || false
    }

    def "isEmailVerified maps an unknown user to not-found and any other failure to a 503"() {
        when:
        lookupStatus = 404
        service.isEmailVerified(USER_ID)

        then:
        thrown(ResourceNotFoundException)

        when:
        lookupStatus = 500
        service.isEmailVerified(USER_ID)

        then:
        thrown(ServiceUnavailableException)
    }

    def "sendVerificationEmail asks the verify-email endpoint to link back to the web app with a long lifespan"() {
        when:
        service.sendVerificationEmail(USER_ID)

        then:
        lastResetAuth == "Bearer svc"
        lastResetPath == "/admin/users/${USER_ID}/send-verify-email"
        lastResetQuery.contains("client_id=sportconnect-web")
        lastResetQuery.contains("redirect_uri=http%3A%2F%2Flocalhost%3A5173%2F")
        lastResetQuery.contains("lifespan=43200")
    }

    def "sendVerificationEmail maps the failures: no email to 400, unknown user to not-found, the rest to a 503"() {
        when:
        resetStatus = 400
        service.sendVerificationEmail(USER_ID)

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "VERIFICATION_EMAIL_UNAVAILABLE"

        when:
        resetStatus = 404
        service.sendVerificationEmail(USER_ID)

        then:
        thrown(ResourceNotFoundException)

        when:
        resetStatus = 500
        service.sendVerificationEmail(USER_ID)

        then:
        thrown(ServiceUnavailableException)
    }
}

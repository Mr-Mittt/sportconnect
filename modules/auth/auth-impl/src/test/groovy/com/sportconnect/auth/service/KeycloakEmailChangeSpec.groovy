package com.sportconnect.auth.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.config.KeycloakProperties
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import spock.lang.Shared
import spock.lang.Specification

import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList

/**
 * U26: the two Keycloak calls behind a change of email, against a tiny local HTTP server so the real {@code RestClient}
 * requests run: the lookup that tells whether another account holds an address (A35 rule), and the one update that moves
 * the account (email, verified, key, username, no Google picture) followed by the unlink of every identity provider.
 */
class KeycloakEmailChangeSpec extends Specification {

    static final UUID USER_ID = UUID.fromString("22222222-2222-2222-2222-222222222222")
    static final UUID OTHER_ID = UUID.fromString("33333333-3333-3333-3333-333333333333")
    static final ObjectMapper JSON = new ObjectMapper()

    /** One request the server saw. */
    static class Seen {
        String method
        String path
        String rawQuery
        String auth
        String body
    }

    @Shared HttpServer server
    @Shared int port
    /** "METHOD /path" -> [status, body]; a route that is not listed answers 404. */
    @Shared Map<String, List> routes = [:]
    @Shared List<Seen> seen = new CopyOnWriteArrayList<>()

    KeycloakCredentialServiceImpl service

    def setupSpec() {
        server = HttpServer.create(new InetSocketAddress(InetAddress.loopbackAddress, 0), 0)
        server.createContext("/token") { HttpExchange ex ->
            ex.requestBody.readAllBytes()
            reply(ex, 200, '{"access_token":"svc","expires_in":60}')
        }
        server.createContext("/admin") { HttpExchange ex ->
            def request = new Seen(method: ex.requestMethod, path: ex.requestURI.path, rawQuery: ex.requestURI.rawQuery,
                    auth: ex.requestHeaders.getFirst("Authorization"),
                    body: new String(ex.requestBody.readAllBytes(), StandardCharsets.UTF_8))
            seen << request
            // a user search can be answered per kind of query: "GET /admin/users?q" (by attribute) or "?email" (exact address)
            String kind = request.rawQuery == null ? "" : (request.rawQuery.startsWith("q=") ? "?q" : (request.rawQuery.startsWith("email=") ? "?email" : ""))
            List route = routes[request.method + " " + request.path + kind] ?: routes[request.method + " " + request.path] ?: [404, ""]
            reply(ex, route[0] as int, route[1] as String)
        }
        server.start()
        port = server.address.port
    }

    def cleanupSpec() {
        server.stop(0)
    }

    def setup() {
        routes.clear()
        seen.clear()
        def props = new KeycloakProperties()
        props.tokenUri = "http://127.0.0.1:${port}/token"
        props.adminUri = "http://127.0.0.1:${port}/admin"
        props.clientId = "sportconnect-web"
        props.redirectUri = "http://localhost:5173/auth/callback"
        props.credentialsClientId = "sportconnect-credentials"
        props.credentialsClientSecret = "s3cret"
        service = new KeycloakCredentialServiceImpl(props)
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

    private static String userJson(Map overrides = [:]) {
        def user = [
                id: USER_ID.toString(), username: "old.name@example.com", email: "old.name@example.com",
                emailVerified: false, enabled: true,
                attributes: [email_normalized: ["old.name@example.com"], country: ["VN"], picture: ["https://lh3.googleusercontent.com/a/x"]],
                createdTimestamp: 1, totp: false, disableableCredentialTypes: [], notBefore: 0,
                access: [manage: true], federatedIdentities: [[identityProvider: "google", userId: "g1", userName: "x"]],
                requiredActions: ["UPDATE_PASSWORD"],
        ] + overrides
        JSON.writeValueAsString(user)
    }

    private List<Seen> requests(String method, String path) {
        seen.findAll { it.method == method && it.path == path }
    }

    private Map putBody() {
        JSON.readValue(requests("PUT", "/admin/users/${USER_ID}")[0].body, Map)
    }

    private void happyRoutes(Map userOverrides = [:], List links = [[identityProvider: "google", userId: "g1", userName: "x"]]) {
        routes["GET /admin/users/${USER_ID}".toString()] = [200, userJson(userOverrides)]
        routes["PUT /admin/users/${USER_ID}".toString()] = [204, ""]
        routes["GET /admin/users/${USER_ID}/federated-identity".toString()] = [200, JSON.writeValueAsString(links)]
        links.each { routes["DELETE /admin/users/${USER_ID}/federated-identity/${it.identityProvider}".toString()] = [204, ""] }
    }

    // ── isEmailRegistered ────────────────────────────────────────────────────

    def "isEmailRegistered looks an address up by its A35 key and by the exact address, with the service token"() {
        given:
        routes["GET /admin/users"] = [200, "[]"]

        when:
        def registered = service.isEmailRegistered("  Bao.Nguyen+x@Gmail.com ", USER_ID)

        then:
        !registered
        seen.size() == 2
        seen.every { it.auth == "Bearer svc" }
        seen[0].rawQuery == "q=email_normalized%3Abaonguyen%40gmail.com&exact=true"
        seen[1].rawQuery == "email=bao.nguyen%2Bx%40gmail.com&exact=true"
    }

    def "the search by key and the search by exact address are each enough to find a holder"() {
        given:
        routes["GET /admin/users?q"] = [200, byKey]
        routes["GET /admin/users?email"] = [200, byEmail]
        def other = '[{"id":"33333333-3333-3333-3333-333333333333"}]'

        expect:
        service.isEmailRegistered("someone@example.com", USER_ID) == expected

        where:
        byKey                                                   | byEmail                                                 || expected
        '[{"id":"33333333-3333-3333-3333-333333333333"}]'   | '[]'                                                    || true    // an account with the key (a Gmail spelling)
        '[]'                                                    | '[{"id":"33333333-3333-3333-3333-333333333333"}]'   || true    // an account with the address but no key yet
        '[]'                                                    | '[]'                                                    || false
    }

    def "isEmailRegistered is true when another account holds the key, and when another holds the exact address with no key"() {
        given:
        routes["GET /admin/users"] = [200, holders]

        expect:
        service.isEmailRegistered("someone@example.com", USER_ID) == expected

        where:
        holders                                                   || expected
        '[{"id":"33333333-3333-3333-3333-333333333333"}]'          || true
        '[{"id":"22222222-2222-2222-2222-222222222222"}]'          || false   // the caller's own account is not a clash
        '[{"id":"22222222-2222-2222-2222-222222222222"},{"id":"33333333-3333-3333-3333-333333333333"}]' || true
        '[]'                                                      || false
    }

    def "isSameMailbox compares the A35 keys without asking Keycloak: '#first' and '#second' are #expected"() {
        expect:
        service.isSameMailbox(first, second) == expected
        seen.isEmpty()

        where:
        first                | second                    || expected
        "jordan@example.com" | "JORDAN@example.com"      || true
        "j.doe@gmail.com"    | "jdoe@gmail.com"          || true    // dots do not count at Google
        "j.doe@gmail.com"    | "jdoe+news@gmail.com"     || true    // nor does +tag
        "j.doe@gmail.com"    | "J.Doe@googlemail.com"    || true    // googlemail.com is gmail.com
        "j.doe@gmail.com"    | "j.doe@gmail.com"         || true
        "j.doe@example.com"  | "jdoe@example.com"        || false   // other providers keep dots
        "j.doe@example.com"  | "j.doe+x@example.com"     || false   // and +
        "j.doe@gmail.com"    | "j.dae@gmail.com"         || false
        "j.doe@gmail.com"    | "j.doe@yahoo.com"         || false
        null                 | "jdoe@gmail.com"          || false
        "jdoe@gmail.com"     | null                      || false
        null                 | null                      || false
        ""                   | ""                        || false
        "no-at-sign"         | "no-at-sign"              || false   // not an address: no key, never "the same"
    }

    def "isEmailRegistered answers false without asking Keycloak for something that is not an address"() {
        expect:
        !service.isEmailRegistered(value, USER_ID)
        seen.isEmpty()

        where:
        value << [null, "", "   ", "no-at-sign"]
    }

    def "isEmailRegistered is a 503 when Keycloak cannot answer the search"() {
        given:
        routes["GET /admin/users"] = [500, ""]

        when:
        service.isEmailRegistered("someone@example.com", USER_ID)

        then:
        thrown(ServiceUnavailableException)
    }

    // ── replaceEmail ─────────────────────────────────────────────────────────

    def "replaceEmail writes the new email, marks it verified, recomputes the key and drops the Google picture"() {
        given:
        happyRoutes()

        when:
        service.replaceEmail(USER_ID, "  New.Name+shop@Gmail.com ")

        then:
        requests("PUT", "/admin/users/${USER_ID}").size() == 1
        requests("PUT", "/admin/users/${USER_ID}")[0].auth == "Bearer svc"
        def body = putBody()
        body.email == "new.name+shop@gmail.com"
        body.emailVerified == true
        body.attributes.email_normalized == ["newname@gmail.com"]
        !body.attributes.containsKey("picture")
    }

    def "replaceEmail sends the whole record back: every other attribute and the required actions survive, read-only fields go"() {
        given:
        happyRoutes()

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        def body = putBody()
        body.attributes.country == ["VN"]
        body.requiredActions == ["UPDATE_PASSWORD"]
        body.enabled == true
        ["id", "createdTimestamp", "totp", "disableableCredentialTypes", "notBefore", "access", "federatedIdentities"]
                .every { !body.containsKey(it) }
    }

    def "replaceEmail moves the username when it is the old email (by the A35 key), and leaves any other username alone"() {
        given:
        happyRoutes(overrides)

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        putBody().username == expected

        where:
        overrides                                                                              || expected
        [:]                                                                                    || "new.name@example.com"
        [username: "OLD.Name@Example.com"]                                                     || "new.name@example.com"
        [username: "+84901234567"]                                                             || "+84901234567"
        [username: "janedoe"]                                                                  || "janedoe"
        [username: "j.doe@gmail.com", email: "jdoe+x@gmail.com"]                               || "new.name@example.com"
    }

    def "replaceEmail unlinks every identity provider after the update, never before it"() {
        given:
        happyRoutes([:], [[identityProvider: "google"], [identityProvider: "facebook"]])

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        seen.collect { it.method + " " + it.path.replace(USER_ID.toString(), "{id}") } == [
                "GET /admin/users/{id}",
                "PUT /admin/users/{id}",
                "GET /admin/users/{id}/federated-identity",
                "DELETE /admin/users/{id}/federated-identity/google",
                "DELETE /admin/users/{id}/federated-identity/facebook",
        ]
    }

    def "replaceEmail with no identity provider linked deletes nothing"() {
        given:
        happyRoutes([:], [])

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        requests("DELETE", "/admin/users/${USER_ID}/federated-identity/google").isEmpty()
        requests("PUT", "/admin/users/${USER_ID}").size() == 1
    }

    def "replaceEmail turns Keycloak's duplicate refusals into EMAIL_ALREADY_REGISTERED and unlinks nothing"() {
        given:
        happyRoutes()
        routes["PUT /admin/users/${USER_ID}".toString()] = [status, body]

        when:
        service.replaceEmail(USER_ID, "taken@example.com")

        then:
        def e = thrown(ConflictException)
        e.errorCode == "EMAIL_ALREADY_REGISTERED"
        requests("GET", "/admin/users/${USER_ID}/federated-identity").isEmpty()

        where:
        status | body
        409    | '{"errorMessage":"User exists with same email"}'
        400    | '{"field":"email","errorMessage":"emailAlreadyUsed","params":["email"]}'
    }

    def "replaceEmail is a 503 for any other refusal (a username the realm will not let us change, a 5xx) and unlinks nothing"() {
        given:
        happyRoutes()
        routes["PUT /admin/users/${USER_ID}".toString()] = [status, body]

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        thrown(ServiceUnavailableException)
        requests("GET", "/admin/users/${USER_ID}/federated-identity").isEmpty()

        where:
        status | body
        400    | '{"field":"username","errorMessage":"error-user-attribute-read-only"}'
        500    | ''
    }

    def "replaceEmail maps an unknown user to not-found, on the read and on the update"() {
        given:
        happyRoutes()
        if (onRead) {
            routes.remove("GET /admin/users/${USER_ID}".toString())
        } else {
            routes["PUT /admin/users/${USER_ID}".toString()] = [404, ""]
        }

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        thrown(ResourceNotFoundException)

        where:
        onRead << [true, false]
    }

    def "replaceEmail is a 503 when the unlink fails after the update, so the same change can be repeated to finish it"() {
        given:
        happyRoutes()
        routes["DELETE /admin/users/${USER_ID}/federated-identity/google".toString()] = [500, ""]

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        thrown(ServiceUnavailableException)
        requests("PUT", "/admin/users/${USER_ID}").size() == 1
    }

    def "replaceEmail is a 503 when the identity providers cannot be read after the update"() {
        given:
        happyRoutes()
        routes["GET /admin/users/${USER_ID}/federated-identity".toString()] = [500, ""]

        when:
        service.replaceEmail(USER_ID, "new.name@example.com")

        then:
        thrown(ServiceUnavailableException)
    }

    def "replaceEmail refuses a value that is not an address before any update"() {
        given:
        happyRoutes()

        when:
        service.replaceEmail(USER_ID, "not an email")

        then:
        thrown(IllegalArgumentException)
        requests("PUT", "/admin/users/${USER_ID}").isEmpty()
    }
}

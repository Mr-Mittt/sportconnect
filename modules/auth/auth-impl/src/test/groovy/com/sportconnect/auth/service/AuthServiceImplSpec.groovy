package com.sportconnect.auth.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.UnauthorizedException
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sportconnect.user.api.dto.ExternalIdentity
import com.sportconnect.user.api.dto.ProvisionedUser
import com.sportconnect.user.api.dto.UserAccessState
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import spock.lang.Specification
import spock.lang.Subject


class AuthServiceImplSpec extends Specification {

    UserService userService
    KeycloakTokenClient keycloak
    JwtDecoder jwtDecoder
    ReactivationTicketStore tickets
    WelcomeEmailService welcomeEmails

    @Subject
    AuthServiceImpl authService

    def setup() {
        userService = Mock(UserService)
        keycloak = Mock(KeycloakTokenClient)
        jwtDecoder = Mock(JwtDecoder)
        tickets = Mock(ReactivationTicketStore)
        welcomeEmails = Mock(WelcomeEmailService)

        authService = new AuthServiceImpl(userService, keycloak, jwtDecoder, tickets, welcomeEmails)
    }

    // ---------- A26: Keycloak sign-in ----------

    private static final String ACCESS = "kc-access-token"

    private static KeycloakTokens tokens(String refresh = "kc-refresh-token") {
        new KeycloakTokens(ACCESS, refresh, 300L, 86400L)
    }

    private static Jwt jwt(UUID sub, Map<String, Object> extra = [:]) {
        def builder = Jwt.withTokenValue(ACCESS).header("alg", "RS256").subject(sub.toString())
        extra.each { k, v -> builder.claim(k, v) }
        builder.build()
    }

    private UserResponse userResponse(UUID id, boolean active) {
        UserResponse.builder().id(id).email("u@example.com").firstName("U").lastName("Ser")
                .isActive(active).roles(new HashSet<>(["USER"])).build()
    }

    def "callback provisions the user from the verified token's claims and opens the session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", email_verified: true, preferred_username: "au",
                given_name: "A", family_name: "U", name: "A U", phone_number: "0901234567", locale: "vi"])

        when:
        def result = authService.callback("c", "v")

        then:
        1 * userService.provisionExternalUser({ ExternalIdentity i ->
            i.id == sub && i.email == "a@example.com" && i.emailVerified && i.username == "au" &&
                    i.firstName == "A" && i.lastName == "U" && i.fullName == "A U" &&
                    i.phoneNumber == "0901234567" && i.languageCode == "vi"
        }) >> new ProvisionedUser(userResponse(sub, true), true)
        1 * userService.updateLastLogin(sub)
        result.accessToken == ACCESS
        result.refreshToken == "kc-refresh-token"
        result.refreshTokenMaxAgeSeconds == 86400L
        result.expiresIn == 300000L
        0 * keycloak.endSession(_)
    }

    def "callback sends the welcome email once, only for the sign-in that created the account"() {
        given:
        def sub = UUID.randomUUID()
        def user = userResponse(sub, true)
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(user, created)

        when:
        authService.callback("c", "v")

        then:
        (created ? 1 : 0) * welcomeEmails.sendTo(user)

        where:
        created << [true, false]
    }

    def "callback sends no welcome email to a deactivated user, who gets a ticket instead"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("parked-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, false), false)
        tickets.issue(_, _) >> "the-ticket"

        when:
        authService.callback("c", "v")

        then:
        thrown(UnauthorizedException)
        0 * welcomeEmails.sendTo(_)
    }

    def "callback treats an absent email_verified claim as unverified"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])

        when:
        authService.callback("c", "v")

        then:
        1 * userService.provisionExternalUser({ ExternalIdentity i -> !i.emailVerified }) >> new ProvisionedUser(userResponse(sub, true), false)
    }

    def "callback reads the register page's geo claims whether Keycloak sends strings or numbers"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", country_id: countryId, region_id: regionId,
                latitude: latitude, longitude: longitude])

        when:
        authService.callback("c", "v")

        then:
        1 * userService.provisionExternalUser({ ExternalIdentity i ->
            i.countryId == expectedCountry && i.regionId == expectedRegion &&
                    i.latitude == expectedLatitude && i.longitude == expectedLongitude
        }) >> new ProvisionedUser(userResponse(sub, true), false)

        where:
        countryId | regionId | latitude  | longitude  || expectedCountry | expectedRegion | expectedLatitude | expectedLongitude
        "7"       | "70"     | "10.7769" | "106.7009" || 7L             | 70L            | 10.7769d         | 106.7009d
        7         | 70       | 10.7769d  | 106.7009d  || 7L             | 70L            | 10.7769d         | 106.7009d
        " 7 "     | ""       | " 10.5 "  | ""         || 7L             | null           | 10.5d            | null
        "seven"   | "x"      | "north"   | "NaN"      || null           | null           | null             | null
        "Infinity"| "1.5"    | "Infinity"| "-Infinity"|| null           | null           | null             | null
    }

    def "callback for a deactivated social user re-activates and opens the session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, false), false)
        userService.applyGoogleAvatarOnce(sub, _) >> userResponse(sub, true)

        when:
        def result = authService.callback("c", "v")

        then:
        1 * userService.reactivateUser(sub) >> userResponse(sub, true)
        1 * userService.updateLastLogin(sub)
        0 * tickets.issue(_, _)
        result.accessToken == ACCESS
    }

    // ---------- A36: the Google picture as the avatar ----------

    private static final String PICTURE = "https://lh3.googleusercontent.com/a/photo=s96-c"

    def "a Google sign-in hands the picture claim to the once-only avatar rule and answers with the user it returns"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google", picture: PICTURE])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, true), false)

        when:
        def result = authService.callback("c", "v")

        then:
        1 * userService.applyGoogleAvatarOnce(sub, PICTURE) >> userResponse(sub, true).tap { avatarUrl = PICTURE }
        result.user.avatarUrl == PICTURE
    }

    def "a Google sign-in without a picture claim still runs the rule (it records the first sign-in)"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, true), false)

        when:
        authService.callback("c", "v")

        then:
        1 * userService.applyGoogleAvatarOnce(sub, null) >> userResponse(sub, true)
    }

    def "a password sign-in and another provider never touch the avatar"() {
        given:
        def sub = UUID.randomUUID()
        def claims = [email: "a@example.com", picture: PICTURE]
        if (provider) {
            claims.identity_provider = provider
        }
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, claims)
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, true), false)

        when:
        authService.callback("c", "v")

        then:
        0 * userService.applyGoogleAvatarOnce(_, _)

        where:
        provider << [null, "facebook"]
    }

    def "a deactivated Google user is re-activated first, then the rule runs on the active user"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google", picture: PICTURE])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, false), false)

        when:
        authService.callback("c", "v")

        then:
        1 * userService.reactivateUser(sub) >> userResponse(sub, true)
        1 * userService.applyGoogleAvatarOnce(sub, PICTURE) >> userResponse(sub, true)
    }

    def "a failure of the avatar rule is logged and the sign-in still opens the session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google", picture: PICTURE])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, true), false)
        userService.applyGoogleAvatarOnce(sub, PICTURE) >> { throw new IllegalStateException("db down") }

        when:
        def result = authService.callback("c", "v")

        then:
        result.accessToken == ACCESS
        0 * keycloak.endSession(_)
    }

    def "callback for a deactivated password user issues a ticket and throws ACCOUNT_DEACTIVATED carrying it, with no session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("parked-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, false), false)

        when:
        authService.callback("c", "v")

        then:
        1 * tickets.issue(sub, "parked-refresh") >> "the-ticket"
        def e = thrown(UnauthorizedException)
        e.errorCode == "ACCOUNT_DEACTIVATED"
        e.errorParams == [reactivationTicket: "the-ticket"]
        0 * userService.reactivateUser(_)
        0 * userService.updateLastLogin(_)
        0 * keycloak.endSession(_)
    }

    def "callback ends the Keycloak session when the ticket store is down, and answers 503"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("parked-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, false), false)
        tickets.issue(_, _) >> { throw new ServiceUnavailableException("redis down") }

        when:
        authService.callback("c", "v")

        then:
        thrown(ServiceUnavailableException)
        1 * keycloak.endSession("parked-refresh")
    }

    def "callback ends the Keycloak session when provisioning fails"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("fresh-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [:])
        userService.provisionExternalUser(_) >> {
            throw new BadRequestException("IDENTIFIER_REQUIRED", "An email or a phone number is required", null)
        }

        when:
        authService.callback("c", "v")

        then:
        def e = thrown(BadRequestException)
        e.errorCode == "IDENTIFIER_REQUIRED"
        1 * keycloak.endSession("fresh-refresh")
    }

    def "callback re-reads the account when a concurrent first sign-in won the race"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])

        when:
        def result = authService.callback("c", "v")

        then:
        1 * userService.provisionExternalUser(_) >> { throw new DataIntegrityViolationException("users_pkey") }
        1 * userService.provisionExternalUser(_) >> new ProvisionedUser(userResponse(sub, true), false)
        result.accessToken == ACCESS
        0 * welcomeEmails.sendTo(_) // the winner of the race sends it, never the loser
    }

    def "callback retries once on a conflict, and a genuine clash still surfaces"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("fresh-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> { throw new ConflictException("PHONE_ALREADY_USED", "taken", null) }

        when:
        authService.callback("c", "v")

        then:
        def e = thrown(ConflictException)
        e.errorCode == "PHONE_ALREADY_USED"
        1 * keycloak.endSession("fresh-refresh")
    }

    def "callback answers 503, not 401, when the token Keycloak issued fails verification, and ends the session"() {
        given:
        keycloak.exchangeCode("c", "v") >> tokens("fresh-refresh")
        jwtDecoder.decode(ACCESS) >> { throw new JwtException("bad issuer") }

        when:
        authService.callback("c", "v")

        then:
        thrown(ServiceUnavailableException)
        1 * keycloak.endSession("fresh-refresh")
        0 * userService.provisionExternalUser(_)
    }

    def "callback passes through a refused code untouched"() {
        given:
        keycloak.exchangeCode("c", "v") >> { throw new UnauthorizedException("AUTH_CODE_INVALID", "no", null) }

        when:
        authService.callback("c", "v")

        then:
        def e = thrown(UnauthorizedException)
        e.errorCode == "AUTH_CODE_INVALID"
        0 * keycloak.endSession(_)
    }

    def "reactivate with a valid ticket reactivates the account and releases a fresh session"() {
        given:
        def sub = UUID.randomUUID()
        tickets.consume("t") >> Optional.of(new ReactivationTicketStore.Ticket(sub, "parked-refresh"))
        keycloak.refresh("parked-refresh") >> tokens("new-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub)

        when:
        def result = authService.reactivate("t")

        then:
        1 * userService.reactivateUser(sub) >> userResponse(sub, true)
        1 * userService.updateLastLogin(sub)
        result.refreshToken == "new-refresh"
        result.accessToken == ACCESS
    }

    def "reactivate with an unknown, expired or used ticket throws REACTIVATION_TICKET_INVALID and changes nothing"() {
        given:
        tickets.consume("t") >> Optional.empty()

        when:
        authService.reactivate("t")

        then:
        def e = thrown(UnauthorizedException)
        e.errorCode == "REACTIVATION_TICKET_INVALID"
        0 * userService.reactivateUser(_)
        0 * keycloak.refresh(_)
    }

    def "reactivate whose parked session has ended is REACTIVATION_TICKET_INVALID and does not reactivate"() {
        given:
        def sub = UUID.randomUUID()
        tickets.consume("t") >> Optional.of(new ReactivationTicketStore.Ticket(sub, "parked-refresh"))
        keycloak.refresh("parked-refresh") >> {
            throw new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "gone", null)
        }

        when:
        authService.reactivate("t")

        then:
        def e = thrown(UnauthorizedException)
        e.errorCode == "REACTIVATION_TICKET_INVALID"
        0 * userService.reactivateUser(_)
    }

    def "reactivate refuses a session that belongs to someone else than the ticket's user, and ends it"() {
        given:
        def sub = UUID.randomUUID()
        tickets.consume("t") >> Optional.of(new ReactivationTicketStore.Ticket(sub, "parked-refresh"))
        keycloak.refresh("parked-refresh") >> tokens("new-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(UUID.randomUUID())

        when:
        authService.reactivate("t")

        then:
        def e = thrown(UnauthorizedException)
        e.errorCode == "REACTIVATION_TICKET_INVALID"
        1 * keycloak.endSession("new-refresh")
        0 * userService.reactivateUser(_)
    }

    def "cancelling a ticket ends the parked session; an unknown ticket is a silent no-op"() {
        when:
        authService.cancelReactivation("t")
        authService.cancelReactivation("unknown")

        then:
        1 * tickets.consume("t") >> Optional.of(new ReactivationTicketStore.Ticket(UUID.randomUUID(), "parked-refresh"))
        1 * tickets.consume("unknown") >> Optional.empty()
        1 * keycloak.endSession("parked-refresh")
    }

    def "cancelling still succeeds when Keycloak cannot be reached to end the session"() {
        given:
        tickets.consume("t") >> Optional.of(new ReactivationTicketStore.Ticket(UUID.randomUUID(), "parked-refresh"))
        keycloak.endSession("parked-refresh") >> { throw new ServiceUnavailableException("down") }

        when:
        authService.cancelReactivation("t")

        then:
        noExceptionThrown()
    }

    def "refresh of an active user returns the new tokens"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.refresh("old") >> tokens("rotated")
        jwtDecoder.decode(ACCESS) >> jwt(sub)
        userService.getAccessState(sub) >> Optional.of(new UserAccessState(true, ["USER"]))
        userService.getUserById(sub) >> userResponse(sub, true)

        when:
        def result = authService.refreshToken("old")

        then:
        result.refreshToken == "rotated"
        result.accessToken == ACCESS
        0 * keycloak.endSession(_)
    }

    def "refresh for a deactivated or unprovisioned user ends the session and throws the generic REFRESH_TOKEN_EXPIRED_OR_REVOKED"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.refresh("old") >> tokens("rotated")
        jwtDecoder.decode(ACCESS) >> jwt(sub)
        userService.getAccessState(sub) >> state

        when:
        authService.refreshToken("old")

        then:
        def e = thrown(UnauthorizedException)
        e.errorCode == "REFRESH_TOKEN_EXPIRED_OR_REVOKED"
        !e.message.contains(sub.toString())
        1 * keycloak.endSession("rotated")
        0 * userService.getUserById(_)

        where:
        state << [Optional.of(new UserAccessState(false, ["USER"])), Optional.empty()]
    }

    def "refresh passes Keycloak's refusal and outage through"() {
        given:
        keycloak.refresh("old") >> { throw failure }

        when:
        authService.refreshToken("old")

        then:
        thrown(failure.class)

        where:
        failure << [new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "gone", null),
                    new ServiceUnavailableException("down")]
    }

    def "endSession delegates to Keycloak and lets an outage through"() {
        when:
        authService.endSession("r")

        then:
        1 * keycloak.endSession("r") >> { throw new ServiceUnavailableException("down") }
        thrown(ServiceUnavailableException)
    }

}

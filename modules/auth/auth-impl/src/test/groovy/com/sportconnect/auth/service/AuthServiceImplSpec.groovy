package com.sportconnect.auth.service

import com.sportconnect.auth.api.dto.LoginRequest
import com.sportconnect.auth.api.dto.RegisterRequest
import com.sportconnect.auth.api.service.JwtTokenService
import com.sportconnect.auth.config.JwtProperties
import com.sportconnect.auth.entity.RefreshToken
import com.sportconnect.auth.repository.EmailVerificationRepository
import com.sportconnect.auth.repository.PasswordResetTokenRepository
import com.sportconnect.auth.repository.RefreshTokenRepository
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.UnauthorizedException
import com.sportconnect.user.api.dto.CredentialCheck
import com.sportconnect.user.api.dto.UserRegistrationDetails
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sportconnect.user.api.dto.ExternalIdentity
import com.sportconnect.user.api.dto.UserAccessState
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime
import java.util.HashSet

class AuthServiceImplSpec extends Specification {

    RefreshTokenRepository refreshTokenRepository
    PasswordEncoder passwordEncoder
    JwtTokenService jwtTokenService
    EmailVerificationRepository emailVerificationRepository
    PasswordResetTokenRepository passwordResetTokenRepository
    UserService userService
    JwtProperties jwtProperties
    KeycloakTokenClient keycloak
    JwtDecoder jwtDecoder
    ReactivationTicketStore tickets

    @Subject
    AuthServiceImpl authService

    def setup() {
        refreshTokenRepository = Mock(RefreshTokenRepository)
        passwordEncoder = Mock(PasswordEncoder)
        jwtTokenService = Mock(JwtTokenService)
        emailVerificationRepository = Mock(EmailVerificationRepository)
        passwordResetTokenRepository = Mock(PasswordResetTokenRepository)
        userService = Mock(UserService)
        jwtProperties = Mock(JwtProperties)
        keycloak = Mock(KeycloakTokenClient)
        jwtDecoder = Mock(JwtDecoder)
        tickets = Mock(ReactivationTicketStore)

        authService = new AuthServiceImpl(
            refreshTokenRepository,
            passwordEncoder,
            jwtTokenService,
            emailVerificationRepository,
            passwordResetTokenRepository,
            userService,
            jwtProperties,
            keycloak,
            jwtDecoder,
            tickets
        )
    }

    def "should register user successfully"() {
        given: "a registration request"
        def request = RegisterRequest.builder()
            .email("test@example.com")
            .password("password123")
            .fullName("John Doe")
            .phoneNumber("1234567890")
            .build()

        and: "email doesn't exist"
        userService.existsByEmail(request.email) >> false

        and: "password encoder encodes password"
        passwordEncoder.encode(request.password) >> "encoded-password"

        and: "user service creates user"
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> UUID.randomUUID()
        userResponse.getEmail() >> request.email
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getUsername() >> null
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        userService.createUser(_, _, _, _, _, _) >> userResponse

        and: "jwt service generates tokens"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when: "registering user"
        def result = authService.register(request)

        then: "should return auth response"
        result != null
        result.accessToken == "access-token"
        result.refreshToken == "refresh-token"
        1 * refreshTokenRepository.save(_)
    }

    // ---------- U16: optional sign-up geo/language details ----------

    private UserResponse registeredUser(String email) {
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> UUID.randomUUID()
        userResponse.getEmail() >> email
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        return userResponse
    }

    def "register passes the optional language, country, region and coordinates through to createUser"() {
        given:
        def request = RegisterRequest.builder()
                .email("geo@example.com").password("password123").fullName("Geo User")
                .languageCode("vi").countryId(7L).regionId(80L).latitude(10.78d).longitude(106.70d)
                .build()
        userService.existsByEmail(request.email) >> false
        passwordEncoder.encode(request.password) >> "encoded-password"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when:
        authService.register(request)

        then:
        1 * userService.createUser("geo@example.com", "encoded-password", "Geo", "User", null,
                { UserRegistrationDetails d ->
                    d.languageCode == "vi" && d.countryId == 7L && d.regionId == 80L &&
                            d.latitude == 10.78d && d.longitude == 106.70d
                }) >> registeredUser("geo@example.com")
    }

    def "register without any extras sends all-null details, exactly what an old client gets"() {
        given:
        def request = RegisterRequest.builder().email("plain@example.com").password("password123").fullName("Plain User").build()
        userService.existsByEmail(request.email) >> false
        passwordEncoder.encode(request.password) >> "encoded-password"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when:
        authService.register(request)

        then:
        1 * userService.createUser(_, _, _, _, _,
                { UserRegistrationDetails d ->
                    d.languageCode == null && d.countryId == null && d.regionId == null &&
                            d.latitude == null && d.longitude == null
                }) >> registeredUser("plain@example.com")
    }

    def "a bad selection surfaces as the 400 createUser throws, and no token or refresh row is created"() {
        given:
        def request = RegisterRequest.builder().email("bad@example.com").password("password123").fullName("Bad Region")
                .countryId(7L).regionId(999L).build()
        userService.existsByEmail(request.email) >> false
        passwordEncoder.encode(request.password) >> "encoded-password"

        when:
        authService.register(request)

        then:
        1 * userService.createUser(*_) >> { throw new BadRequestException("Region 999 is unknown") }
        thrown(BadRequestException)
        0 * jwtTokenService.generateAccessToken(_)
        0 * refreshTokenRepository.save(_)
    }

    def "register rejects a duplicate email with a 409 ConflictException coded EMAIL_ALREADY_REGISTERED"() {
        given:
        def request = RegisterRequest.builder()
                .email("dup@example.com").password("password123").fullName("Dup User").build()
        userService.existsByEmail(request.email) >> true

        when:
        authService.register(request)

        then:
        def e = thrown(ConflictException)
        e.message == "Email already registered"
        e.errorCode == "EMAIL_ALREADY_REGISTERED"
        0 * userService.createUser(*_)
    }

    def "login with bad credentials throws UnauthorizedException coded INVALID_CREDENTIALS"() {
        given:
        def request = LoginRequest.builder().email("a@example.com").password("wrong").build()
        userService.verifyCredentials(request.email, request.password) >> CredentialCheck.NO_MATCH

        when:
        authService.login(request)

        then:
        def e = thrown(UnauthorizedException)
        e.message == "Invalid email or password"
        e.errorCode == "INVALID_CREDENTIALS"
    }

    def "login with the correct password for a deactivated account throws ACCOUNT_DEACTIVATED and issues no tokens"() {
        given:
        def request = LoginRequest.builder().email("gone@example.com").password("right").build()
        userService.verifyCredentials(request.email, request.password) >> CredentialCheck.MATCH_INACTIVE

        when:
        authService.login(request)

        then:
        def e = thrown(UnauthorizedException)
        e.message == "Account is deactivated"
        e.errorCode == "ACCOUNT_DEACTIVATED"
        0 * userService.getUserByEmail(_)
        0 * userService.updateLastLogin(_)
        0 * jwtTokenService.generateAccessToken(_)
        0 * refreshTokenRepository.save(_)
    }

    def "should login user successfully"() {
        given: "a login request"
        def request = LoginRequest.builder()
            .email("test@example.com")
            .password("password123")
            .build()

        and: "password verification succeeds"
        userService.verifyCredentials(request.email, request.password) >> CredentialCheck.MATCH

        and: "user service returns user"
        def userResponse = Mock(UserResponse)
        userResponse.getId() >> UUID.randomUUID()
        userResponse.getEmail() >> request.email
        userResponse.getFirstName() >> "John"
        userResponse.getLastName() >> "Doe"
        userResponse.getUsername() >> null
        userResponse.getRoles() >> new HashSet<>(["USER"])
        userResponse.getIsActive() >> true
        userService.getUserByEmail(request.email) >> userResponse

        and: "jwt service generates tokens"
        jwtTokenService.generateAccessToken(_) >> "access-token"
        jwtTokenService.generateRefreshToken(_) >> "refresh-token"
        jwtTokenService.getRefreshExpiration() >> 604800000L
        jwtProperties.getExpiration() >> 3600000L

        when: "logging in"
        def result = authService.login(request)

        then: "should return auth response"
        result != null
        result.accessToken == "access-token"
        result.refreshToken == "refresh-token"
        1 * userService.updateLastLogin(_)
        1 * refreshTokenRepository.save(_)
    }

    def "should logout user and revoke all tokens"() {
        given: "a user ID"
        def userId = UUID.randomUUID()
        def now = LocalDateTime.now()

        when: "logging out user"
        authService.logout(userId)

        then: "should revoke all user tokens"
        1 * refreshTokenRepository.revokeAllUserTokens(userId, _)
    }

    def "should create refresh token with correct expiration"() {
        given: "user ID and token string"
        def userId = UUID.randomUUID()
        def tokenString = "refresh-token-123"
        def refreshExpiration = 604800000L // 7 days
        
        and: "jwt service returns expiration"
        jwtTokenService.getRefreshExpiration() >> refreshExpiration

        when: "creating refresh token"
        def result = authService.createRefreshToken(userId, tokenString)

        then: "should save token with correct data"
        1 * refreshTokenRepository.save({ RefreshToken token ->
            token.userId == userId &&
            token.token == tokenString &&
            token.expiresAt.isAfter(LocalDateTime.now()) &&
            token.revokedAt == null
        })
        
        and: "should return token string"
        result == tokenString
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
        }) >> userResponse(sub, true)
        1 * userService.updateLastLogin(sub)
        result.accessToken == ACCESS
        result.refreshToken == "kc-refresh-token"
        result.refreshTokenMaxAgeSeconds == 86400L
        result.expiresIn == 300000L
        0 * keycloak.endSession(_)
    }

    def "callback treats an absent email_verified claim as unverified"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])

        when:
        authService.callback("c", "v")

        then:
        1 * userService.provisionExternalUser({ ExternalIdentity i -> !i.emailVerified }) >> userResponse(sub, true)
    }

    def "callback for a deactivated social user re-activates and opens the session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens()
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com", identity_provider: "google"])
        userService.provisionExternalUser(_) >> userResponse(sub, false)

        when:
        def result = authService.callback("c", "v")

        then:
        1 * userService.reactivateUser(sub) >> userResponse(sub, true)
        1 * userService.updateLastLogin(sub)
        0 * tickets.issue(_, _)
        result.accessToken == ACCESS
    }

    def "callback for a deactivated password user issues a ticket and throws ACCOUNT_DEACTIVATED carrying it, with no session"() {
        given:
        def sub = UUID.randomUUID()
        keycloak.exchangeCode("c", "v") >> tokens("parked-refresh")
        jwtDecoder.decode(ACCESS) >> jwt(sub, [email: "a@example.com"])
        userService.provisionExternalUser(_) >> userResponse(sub, false)

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
        userService.provisionExternalUser(_) >> userResponse(sub, false)
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
        1 * userService.provisionExternalUser(_) >> userResponse(sub, true)
        result.accessToken == ACCESS
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

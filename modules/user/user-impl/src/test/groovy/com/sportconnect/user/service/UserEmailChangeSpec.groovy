package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.KeycloakCredentialService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.common.exception.ServiceUnavailableException
import com.sportconnect.common.exception.TooManyRequestsException
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.ChangeEmailRequest
import com.sportconnect.user.api.dto.ConfirmationCodeResponse
import com.sportconnect.user.api.dto.ConfirmationPurpose
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.User
import com.sportconnect.user.entity.UserPreference
import com.sportconnect.user.repository.RoleRepository
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.data.redis.connection.stream.MapRecord
import org.springframework.data.redis.core.StreamOperations
import org.springframework.data.redis.core.StringRedisTemplate
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

/**
 * U26: the two steps of an email change in {@code UserServiceImpl}, with every collaborator mocked so the order of the
 * checks and what is (not) touched on each failure can be pinned. The real wiring is covered by
 * {@code ChangeEmailIntegrationTest}.
 */
class UserEmailChangeSpec extends Specification {

    static final UUID ID = UUID.fromString("44444444-4444-4444-4444-444444444444")
    static final String GOOGLE_PICTURE = "https://lh3.googleusercontent.com/a/pic"

    UserRepository userRepository = Mock()
    RoleRepository roleRepository = Mock()
    AccountConfirmationService accountConfirmation = Mock()
    KeycloakCredentialService keycloakCredentials = Mock()
    UserFriendService userFriendService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ReferenceService referenceService = Mock()
    UserPreferenceRepository userPreferenceRepository = Mock()
    UserAccessStateCache accessStateCache = Mock()
    ObjectMapper objectMapper = new ObjectMapper()

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, roleRepository, accountConfirmation, keycloakCredentials,
            userFriendService, userSportProfileService, stringRedisTemplate, objectMapper, referenceService,
            userPreferenceRepository, accessStateCache, Mock(UserProvisioningLock))

    def setup() {
        // The user's stored language (Vietnamese): the mail is written in it.
        userPreferenceRepository.findByUserId(_) >> Optional.of(UserPreference.builder().language("vi").build())
        referenceService.isActiveLanguage("vi") >> true
    }

    private User account(Map overrides = [:]) {
        def builder = User.builder().id(ID).email("old@example.com").firstName("Old").lastName("Name").isActive(true)
                .isEmailVerified(false).roles([] as Set)
        overrides.each { key, value -> builder."$key"(value) }
        builder.build()
    }

    private static ChangeEmailRequest request(Map overrides = [:]) {
        def request = ChangeEmailRequest.builder().newEmail("new@example.com").newEmailCode("123456").currentPassword("pw").build()
        overrides.each { key, value -> request."$key" = value }
        request
    }

    // ── step 1: sendNewEmailCode ─────────────────────────────────────────────

    def "sendNewEmailCode mails the code to the trimmed, lowercased new address in the user's language"() {
        given:
        def response = ConfirmationCodeResponse.builder().resendAfterSeconds(60).expiresInSeconds(900).build()

        when:
        def result = userService.sendNewEmailCode(ID, "  New.Name@Example.COM ")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        1 * userRepository.existsByEmail("new.name@example.com") >> false
        1 * accountConfirmation.isEmailRegisteredElsewhere(ID, "new.name@example.com") >> false
        1 * accountConfirmation.sendNewEmailCode(ID, "new.name@example.com", Optional.of("vi")) >> response
        result.is(response)
    }

    def "sendNewEmailCode is not-found for an unknown or deactivated caller and sends nothing"() {
        when:
        userService.sendNewEmailCode(ID, "new@example.com")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.empty()
        thrown(ResourceNotFoundException)
        0 * accountConfirmation._
    }

    def "sendNewEmailCode refuses the caller's own address (any case) before anything is looked up or sent"() {
        when:
        userService.sendNewEmailCode(ID, "OLD@Example.com")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        def e = thrown(BadRequestException)
        e.errorCode == "NEW_EMAIL_SAME_AS_CURRENT"
        0 * userRepository.existsByEmail(_)
        0 * accountConfirmation._
    }

    def "sendNewEmailCode refuses an address another account holds, by the users table or by Keycloak, and sends nothing"() {
        when:
        userService.sendNewEmailCode(ID, "taken@example.com")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        1 * userRepository.existsByEmail("taken@example.com") >> inDatabase
        (inDatabase ? 0 : 1) * accountConfirmation.isEmailRegisteredElsewhere(ID, "taken@example.com") >> inKeycloak
        def e = thrown(ConflictException)
        e.errorCode == "EMAIL_ALREADY_REGISTERED"
        0 * accountConfirmation.sendNewEmailCode(*_)

        where:
        inDatabase | inKeycloak
        true       | false
        false      | true
    }

    def "sendNewEmailCode passes on the resend and daily-limit refusals and a down Keycloak"() {
        given:
        userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        userRepository.existsByEmail(_) >> false
        accountConfirmation.isEmailRegisteredElsewhere(*_) >> false
        accountConfirmation.sendNewEmailCode(*_) >> { throw failure }

        when:
        userService.sendNewEmailCode(ID, "new@example.com")

        then:
        thrown(type)

        where:
        failure                                                                                              | type
        new TooManyRequestsException("VERIFICATION_RESEND_TOO_SOON", "wait", [seconds: 30L])                   | TooManyRequestsException
        new TooManyRequestsException("NEW_EMAIL_CODE_LIMIT_REACHED", "later", [seconds: 3600L])                | TooManyRequestsException
        new ServiceUnavailableException("down")                                                              | ServiceUnavailableException
    }

    def "an account with no email yet (phone only) can ask for a code for its first address"() {
        when:
        userService.sendNewEmailCode(ID, "first@example.com")

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account(email: null, phoneNumber: "+84901234567"))
        1 * userRepository.existsByEmail("first@example.com") >> false
        1 * accountConfirmation.isEmailRegisteredElsewhere(ID, "first@example.com") >> false
        1 * accountConfirmation.sendNewEmailCode(ID, "first@example.com", Optional.of("vi")) >> ConfirmationCodeResponse.builder().build()
    }

    def "the generic code endpoint refuses the NEW_EMAIL purpose (it would mail the current address) and still serves CHANGE_EMAIL"() {
        when:
        userService.sendConfirmationCode(ID, ConfirmationPurpose.NEW_EMAIL)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        def e = thrown(BadRequestException)
        e.errorCode == "VALIDATION_FAILED"
        0 * accountConfirmation._

        when:
        userService.sendConfirmationCode(ID, ConfirmationPurpose.CHANGE_EMAIL)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(ID) >> Optional.of(account())
        1 * accountConfirmation.sendCode(ID, "old@example.com", ConfirmationPurpose.CHANGE_EMAIL, Optional.of("vi")) >> ConfirmationCodeResponse.builder().build()
    }

    // ── step 2: changeEmail ──────────────────────────────────────────────────

    def "changeEmail proves the caller, then the new mailbox, then changes Keycloak, then the database copy, in that order"() {
        given:
        def user = account()

        when:
        userService.changeEmail(ID, request(newEmail: "  New@Example.com "))

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(user)

        then: "the caller is checked with the password (checked, not spent)"
        1 * accountConfirmation.check(ID, ConfirmationPurpose.CHANGE_EMAIL, "pw", null)

        then: "the new mailbox is checked for the exact lowercased address (checked, not spent)"
        1 * accountConfirmation.checkNewEmail(ID, "new@example.com", "123456")

        then: "the address is checked again, then Keycloak is changed"
        1 * userRepository.existsByEmail("new@example.com") >> false
        1 * accountConfirmation.isEmailRegisteredElsewhere(ID, "new@example.com") >> false
        1 * accountConfirmation.replaceEmailInKeycloak(ID, "new@example.com")

        then: "the copy follows, verified"
        1 * userRepository.saveAndFlush({ User u -> u.email == "new@example.com" && u.isEmailVerified }) >> { User u -> u }

        then: "pending codes are dropped and the access-state cache evicted"
        1 * accountConfirmation.purgeAfterEmailChange(ID)
        1 * accessStateCache.evictAfterCommit(ID)
        0 * accountConfirmation.discardNewEmailCode(_)
        0 * accountConfirmation.confirm(*_)
    }

    def "changeEmail accepts the emailed CHANGE_EMAIL code as the caller's proof"() {
        when:
        userService.changeEmail(ID, request(currentPassword: null, verificationCode: "654321"))

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        1 * accountConfirmation.check(ID, ConfirmationPurpose.CHANGE_EMAIL, null, "654321")
        1 * userRepository.saveAndFlush(_) >> { User u -> u }
    }

    def "changeEmail clears a Google picture, resets the once-only flag and tells the chat service; an own avatar is kept"() {
        given:
        def user = account(avatarUrl: avatar, googleAvatarCheckedAt: LocalDateTime.now())
        def streamOps = Mock(StreamOperations)

        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(user)
        1 * userRepository.saveAndFlush(_) >> { User u -> u }
        user.avatarUrl == expectedAvatar
        user.googleAvatarCheckedAt == null
        (published ? 1 : 0) * stringRedisTemplate.opsForStream() >> streamOps
        (published ? 1 : 0) * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'user.profile_updated' && payload['user_id'] == ID.toString() && payload['avatar_url'] == ''
        })

        where:
        avatar                                  | expectedAvatar                          | published
        GOOGLE_PICTURE                          | null                                    | true
        "https://cdn.example.com/own.png"       | "https://cdn.example.com/own.png"       | false
        null                                    | null                                    | false
        "https://evil.example.com/googleusercontent.com" | "https://evil.example.com/googleusercontent.com" | false
    }

    def "changeEmail works for an account that has no email yet (phone only), with a password proof"() {
        given:
        def user = account(email: null, phoneNumber: "+84901234567")

        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(user)
        1 * accountConfirmation.replaceEmailInKeycloak(ID, "new@example.com")
        1 * userRepository.saveAndFlush(_) >> { User u -> u }
        user.email == "new@example.com"
        user.isEmailVerified
    }

    def "changeEmail is not-found for an unknown or deactivated caller and consumes nothing"() {
        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> found
        thrown(ResourceNotFoundException)
        0 * accountConfirmation._
        0 * userRepository.saveAndFlush(_)

        where:
        found << [Optional.empty(), Optional.of(User.builder().id(ID).email("old@example.com").isActive(false).roles([] as Set).build())]
    }

    def "changeEmail refuses the account's own address before any proof is consumed"() {
        when:
        userService.changeEmail(ID, request(newEmail: "Old@Example.com"))

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        def e = thrown(BadRequestException)
        e.errorCode == "NEW_EMAIL_SAME_AS_CURRENT"
        0 * accountConfirmation._
    }

    def "a wrong or missing caller proof stops the change: the new-address code is not checked, spent or discarded and nothing is written"() {
        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        1 * accountConfirmation.check(ID, ConfirmationPurpose.CHANGE_EMAIL, "pw", null) >> { throw failure }
        thrown(type)
        0 * accountConfirmation.checkNewEmail(*_)
        0 * accountConfirmation.discardNewEmailCode(_)
        0 * accountConfirmation.replaceEmailInKeycloak(*_)
        0 * userRepository.saveAndFlush(_)
        0 * accountConfirmation.purgeAfterEmailChange(_)

        where:
        failure                                                                          | type
        new BadRequestException("CURRENT_PASSWORD_INCORRECT", "wrong", null)             | BadRequestException
        new BadRequestException("CONFIRMATION_REQUIRED", "neither or both", null)         | BadRequestException
        new TooManyRequestsException("PASSWORD_ATTEMPTS_EXCEEDED", "locked", [seconds: 60L]) | TooManyRequestsException
        new ServiceUnavailableException("down")                                          | ServiceUnavailableException
    }

    def "a wrong, expired or foreign new-address code stops the change before Keycloak is touched and keeps the codes for another try"() {
        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        1 * accountConfirmation.check(ID, ConfirmationPurpose.CHANGE_EMAIL, "pw", null)
        1 * accountConfirmation.checkNewEmail(ID, "new@example.com", "123456") >> { throw new BadRequestException(code, "x", null) }
        def e = thrown(BadRequestException)
        e.errorCode == code
        0 * accountConfirmation.confirm(*_)
        0 * accountConfirmation.discardNewEmailCode(_)
        0 * accountConfirmation.replaceEmailInKeycloak(*_)
        0 * userRepository.saveAndFlush(_)
        0 * accountConfirmation.purgeAfterEmailChange(_)

        where:
        code << ["VERIFICATION_CODE_INVALID", "VERIFICATION_CODE_EXPIRED", "VERIFICATION_CODE_ATTEMPTS_EXCEEDED"]
    }

    def "an address taken since the code was sent stops the change before Keycloak is touched, drops the new-address code and keeps the caller's proof"() {
        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        1 * userRepository.existsByEmail("new@example.com") >> inDatabase
        (inDatabase ? 0 : 1) * accountConfirmation.isEmailRegisteredElsewhere(ID, "new@example.com") >> true
        def e = thrown(ConflictException)
        e.errorCode == "EMAIL_ALREADY_REGISTERED"
        1 * accountConfirmation.discardNewEmailCode(ID)
        0 * accountConfirmation.confirm(*_)
        0 * accountConfirmation.purgeAfterEmailChange(_)
        0 * accountConfirmation.replaceEmailInKeycloak(*_)
        0 * userRepository.saveAndFlush(_)

        where:
        inDatabase << [true, false]
    }

    def "when Keycloak itself refuses the address or fails, the database copy and the caches are left alone"() {
        given:
        def user = account()

        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(user)
        1 * accountConfirmation.replaceEmailInKeycloak(ID, "new@example.com") >> { throw failure }
        thrown(type)
        user.email == "old@example.com"
        !user.isEmailVerified
        0 * userRepository.saveAndFlush(_)
        0 * accountConfirmation.purgeAfterEmailChange(_)
        0 * accessStateCache.evictAfterCommit(_)
        (discarded ? 1 : 0) * accountConfirmation.discardNewEmailCode(ID)
        0 * accountConfirmation.confirm(*_)

        where:
        failure                                                         | type                        | discarded
        new ConflictException("EMAIL_ALREADY_REGISTERED", "taken", null) | ConflictException           | true
        new ServiceUnavailableException("down")                         | ServiceUnavailableException | false
    }

    def "when the database write fails after Keycloak changed, the failure is rethrown and no cache or code is touched"() {
        when:
        userService.changeEmail(ID, request())

        then:
        1 * userRepository.findByIdForUpdate(ID) >> Optional.of(account())
        1 * accountConfirmation.replaceEmailInKeycloak(ID, "new@example.com")
        1 * userRepository.saveAndFlush(_) >> { throw new IllegalStateException("db down") }
        thrown(IllegalStateException)
        0 * accountConfirmation.discardNewEmailCode(_)
        0 * accountConfirmation.purgeAfterEmailChange(_)
        0 * accessStateCache.evictAfterCommit(_)
    }
}

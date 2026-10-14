package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.CredentialCheck
import com.sportconnect.user.api.dto.UpdateProfileRequest
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.Role
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.RoleRepository
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

/** U23: an account is identified by an email, a phone (E.164, unique), or both. */
class UserIdentifiersSpec extends Specification {

    UserRepository userRepository = Mock()
    RoleRepository roleRepository = Mock()
    PasswordEncoder passwordEncoder = Mock()
    UserFriendService userFriendService = Mock()
    AuthService authService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ReferenceService referenceService = Mock()
    UserPreferenceRepository userPreferenceRepository = Mock()

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, roleRepository, passwordEncoder, userFriendService,
            authService, userSportProfileService, stringRedisTemplate, new ObjectMapper(), referenceService, userPreferenceRepository, Mock(UserAccessStateCache), Mock(UserProvisioningLock))

    private static final Role USER_ROLE = new Role(id: 1, name: "USER")

    private User existing(UUID id, String email, String phone) {
        User.builder().id(id).email(email).phoneNumber(phone).isActive(true).roles([USER_ROLE] as Set).build()
    }

    // ---- createUser ----

    def "createUser stores a national-format phone as E.164 after checking it is free"() {
        when:
        def result = userService.createUser("a@example.com", "hash", "A", "B", "0901234567")

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.existsByPhoneNumber("+84901234567") >> false
        1 * userRepository.save({ User u -> u.phoneNumber == "+84901234567" && u.email == "a@example.com" }) >> { User u -> u }
        1 * userRepository.flush()
        result.phoneNumber == "+84901234567"
    }

    def "createUser rejects a phone another account already holds, whichever format it is typed in"() {
        when:
        userService.createUser("a@example.com", "hash", "A", "B", "0901234567")

        then:
        1 * userRepository.existsByPhoneNumber("+84901234567") >> true
        0 * userRepository.save(_)
        def e = thrown(ConflictException)
        e.errorCode == "PHONE_ALREADY_USED"
    }

    def "createUser rejects an unparseable phone with INVALID_PHONE_NUMBER and saves nothing"() {
        when:
        userService.createUser("a@example.com", "hash", "A", "B", "555-0100")

        then:
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "INVALID_PHONE_NUMBER"
    }

    def "createUser creates a phone-only account (no email) and stores a null email, not an empty string"() {
        when:
        def result = userService.createUser(email, null, "Z", "Alo", "+84901234567")

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.existsByPhoneNumber("+84901234567") >> false
        1 * userRepository.save({ User u -> u.email == null && u.phoneNumber == "+84901234567" }) >> { User u -> u }
        result.email == null

        where:
        email << [null, "", "  "]
    }

    def "createUser requires an email or a phone"() {
        when:
        userService.createUser(null, "hash", "A", "B", null)

        then:
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "IDENTIFIER_REQUIRED"
    }

    def "createUser turns a unique-constraint race on phone_number into PHONE_ALREADY_USED"() {
        when:
        userService.createUser("a@example.com", "hash", "A", "B", "+84901234567")

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.existsByPhoneNumber("+84901234567") >> false
        1 * userRepository.save(_) >> { throw new DataIntegrityViolationException("x", new RuntimeException('duplicate key value violates unique constraint "uq_users_phone_number"')) }
        def e = thrown(ConflictException)
        e.errorCode == "PHONE_ALREADY_USED"
    }

    def "createUser rethrows any other integrity violation unchanged"() {
        when:
        userService.createUser("a@example.com", "hash", "A", "B", null)

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save(_) >> { throw new DataIntegrityViolationException("x", new RuntimeException('duplicate key value violates unique constraint "users_username_key"')) }
        thrown(DataIntegrityViolationException)
    }

    def "createUser turns a unique-constraint race on email into EMAIL_ALREADY_REGISTERED (A26)"() {
        when:
        userService.createUser("a@example.com", "hash", "A", "B", null)

        then:
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save(_) >> { throw new DataIntegrityViolationException("x", new RuntimeException('duplicate key value violates unique constraint "users_email_key"')) }
        def e = thrown(ConflictException)
        e.errorCode == "EMAIL_ALREADY_REGISTERED"
    }

    // ---- updateProfile ----

    def "updateProfile normalises the phone and checks it against other users only"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, "me@example.com", null)

        when:
        def result = userService.updateProfile(id, id, UpdateProfileRequest.builder().phoneNumber("0901234567").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        1 * userRepository.existsByPhoneNumberAndIdNot("+84901234567", id) >> false
        1 * userRepository.save({ User u -> u.phoneNumber == "+84901234567" }) >> { User u -> u }
        result.phoneNumber == "+84901234567"
    }

    def "updateProfile does not re-check uniqueness when the caller re-sends their own number in another format"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, "me@example.com", "+84901234567")

        when:
        userService.updateProfile(id, id, UpdateProfileRequest.builder().phoneNumber("0901 234 567").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        0 * userRepository.existsByPhoneNumber(_)
        0 * userRepository.existsByPhoneNumberAndIdNot(_, _)
        1 * userRepository.save(_) >> { User u -> u }
    }

    def "updateProfile rejects another user's number with PHONE_ALREADY_USED and changes nothing"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, "me@example.com", null)

        when:
        userService.updateProfile(id, id, UpdateProfileRequest.builder().phoneNumber("+84901234567").bio("x").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        1 * userRepository.existsByPhoneNumberAndIdNot("+84901234567", id) >> true
        0 * userRepository.save(_)
        def e = thrown(ConflictException)
        e.errorCode == "PHONE_ALREADY_USED"
        user.bio == null
    }

    def "updateProfile clears the phone when a blank value is sent and the account has an email"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, "me@example.com", "+84901234567")

        when:
        userService.updateProfile(id, id, UpdateProfileRequest.builder().phoneNumber("").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        1 * userRepository.save({ User u -> u.phoneNumber == null }) >> { User u -> u }
    }

    def "updateProfile refuses to clear the only identifier of a phone-only account"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, null, "+84901234567")

        when:
        userService.updateProfile(id, id, UpdateProfileRequest.builder().phoneNumber("").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        0 * userRepository.save(_)
        def e = thrown(BadRequestException)
        e.errorCode == "IDENTIFIER_REQUIRED"
        user.phoneNumber == "+84901234567"
    }

    def "updateProfile leaves the phone alone when the field is omitted"() {
        given:
        def id = UUID.randomUUID()
        def user = existing(id, "me@example.com", "+84901234567")

        when:
        userService.updateProfile(id, id, UpdateProfileRequest.builder().bio("hi").build())

        then:
        1 * userRepository.findByIdAndIsActiveTrue(id) >> Optional.of(user)
        0 * userRepository.existsByPhoneNumber(_)
        0 * userRepository.existsByPhoneNumberAndIdNot(_, _)
        1 * userRepository.save({ User u -> u.phoneNumber == "+84901234567" }) >> { User u -> u }
    }

    // ---- email-keyed methods never treat a missing email as a value to look up ----

    def "a null or blank email never reaches the repository (a derived findByEmail(null) would match email IS NULL)"() {
        when:
        def check = userService.verifyCredentials(email, "pw")
        def exists = userService.existsByEmail(email)
        def id = userService.findUserIdByEmail(email)

        then:
        0 * userRepository._
        check == CredentialCheck.NO_MATCH
        !exists
        id.isEmpty()

        where:
        email << [null, "", "  "]
    }

    def "getUserByEmail and reactivateUserByEmail throw not-found for a null or blank email without a lookup"() {
        when:
        userService."$method"(email)

        then:
        0 * userRepository._
        thrown(ResourceNotFoundException)

        where:
        [method, email] << [["getUserByEmail", "reactivateUserByEmail"], [null, ""]].combinations()
    }

    // ---- display name ----

    def "a phone-only account with no name or username shows a masked phone, never null"() {
        expect:
        existing(UUID.randomUUID(), null, "+84901234567").fullName == "+84" + ("•" * 7) + "67"
        UserResponse.builder().phoneNumber("+84901234567").build().fullName == "+84" + ("•" * 7) + "67"
    }

    def "the display name keeps its order: full name, then username, then email, then masked phone"() {
        expect:
        User.builder().firstName("A").lastName("B").username("u").email("e@x.com").phoneNumber("+84901234567").build().fullName == "A B"
        User.builder().username("u").email("e@x.com").phoneNumber("+84901234567").build().fullName == "u"
        User.builder().email("e@x.com").phoneNumber("+84901234567").build().fullName == "e@x.com"
    }
}

package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ConflictException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.ExternalIdentity
import com.sportconnect.user.api.dto.PhoneStatus
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.Role
import com.sportconnect.user.entity.User
import com.sportconnect.user.entity.UserPreference
import com.sportconnect.user.repository.RoleRepository
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

/** A26: the first-sign-in provisioning from a Keycloak identity, and re-activation by id. */
class UserProvisioningSpec extends Specification {

    UserRepository userRepository = Mock()
    RoleRepository roleRepository = Mock()
    PasswordEncoder passwordEncoder = Mock()
    UserFriendService userFriendService = Mock()
    AuthService authService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ReferenceService referenceService = Mock()
    UserPreferenceRepository userPreferenceRepository = Mock()
    UserAccessStateCache accessStateCache = Mock()
    UserProvisioningLock provisioningLock = Mock()

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, roleRepository, passwordEncoder, userFriendService,
            authService, userSportProfileService, stringRedisTemplate, new ObjectMapper(), referenceService,
            userPreferenceRepository, accessStateCache, provisioningLock)

    private static final Role USER_ROLE = new Role(id: 1, name: "USER")

    private final UUID sub = UUID.randomUUID()

    private ExternalIdentity.ExternalIdentityBuilder identity() {
        ExternalIdentity.builder().id(sub).email("a@example.com").emailVerified(true).username("auser")
                .firstName("A").lastName("User")
    }

    // ---- provisionExternalUser ----

    def "creates the user with the subject as id, the USER role, no password and the verified flag from the token"() {
        when:
        def result = userService.provisionExternalUser(identity().build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail("a@example.com") >> false
        1 * userRepository.existsByUsername("auser") >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u ->
            u.id == sub && u.email == "a@example.com" && u.isEmailVerified && u.isActive && u.passwordHash == null &&
                    u.username == "auser" && u.firstName == "A" && u.lastName == "User" &&
                    u.roles*.name == ["USER"] && u.isNew()
        }) >> { User u -> u }
        1 * userRepository.flush()
        result.id == sub
    }

    def "the per-subject lock is taken before the row is looked up, for a new and for an existing subject"() {
        when:
        userService.provisionExternalUser(identity().build())

        then:
        1 * provisioningLock.acquire(sub)

        then:
        1 * userRepository.findById(sub) >> Optional.of(User.builder().id(sub).isActive(true).roles([USER_ROLE] as Set).build())
    }

    def "an account that already exists is returned as it is, active or not, and nothing is saved"() {
        given:
        def existing = User.builder().id(sub).email("kept@example.com").isActive(false).roles([USER_ROLE] as Set).build()

        when:
        def result = userService.provisionExternalUser(identity().email("other@example.com").build())

        then:
        1 * userRepository.findById(sub) >> Optional.of(existing)
        0 * userRepository.save(_)
        0 * userPreferenceRepository.save(_)
        result.email == "kept@example.com"
        result.isActive == false
    }

    def "a national-format phone is stored as E.164 and must be free"() {
        when:
        userService.provisionExternalUser(identity().email(null).phoneNumber("0901234567").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByPhoneNumber("+84901234567") >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.phoneNumber == "+84901234567" && u.email == null }) >> { User u -> u }
    }

    def "a phone another account holds is PHONE_ALREADY_USED and nothing is saved"() {
        when:
        userService.provisionExternalUser(identity().phoneNumber("0901234567").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByPhoneNumber("+84901234567") >> true
        0 * userRepository.save(_)
        def e1 = thrown(ConflictException)
        e1.errorCode == "PHONE_ALREADY_USED"
    }

    def "neither email nor phone is IDENTIFIER_REQUIRED"() {
        when:
        userService.provisionExternalUser(identity().email(email).phoneNumber(null).build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        0 * userRepository.save(_)
        def e2 = thrown(BadRequestException)
        e2.errorCode == "IDENTIFIER_REQUIRED"
        where:
        email << [null, "", "   "]
    }

    def "an unparseable phone is stored as typed with status INVALID and never fails the sign-in (U25)"() {
        when:
        def result = userService.provisionExternalUser(identity().phoneNumber("12").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        0 * userRepository.existsByPhoneNumber(_)
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.phoneNumber == "12" && u.phoneStatus == PhoneStatus.INVALID && u.email != null }) >> { User u -> u }
        result.phoneNumber == "12"
        result.phoneStatus == PhoneStatus.INVALID
    }

    def "a parseable phone is stored with status VALID (U25)"() {
        when:
        userService.provisionExternalUser(identity().phoneNumber("0901234567").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByPhoneNumber("+84901234567") >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.phoneStatus == PhoneStatus.VALID }) >> { User u -> u }
    }

    def "an unparseable phone is no identifier: without an email it is IDENTIFIER_REQUIRED (U25)"() {
        when:
        userService.provisionExternalUser(identity().email(null).phoneNumber("12").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        0 * userRepository.save(_)
        def e3 = thrown(BadRequestException)
        e3.errorCode == "IDENTIFIER_REQUIRED"
    }

    def "no phone leaves the status null (U25)"() {
        when:
        userService.provisionExternalUser(identity().phoneNumber(null).build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.phoneNumber == null && u.phoneStatus == null }) >> { User u -> u }
    }

    def "an email another account holds is EMAIL_ALREADY_REGISTERED"() {
        when:
        userService.provisionExternalUser(identity().build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail("a@example.com") >> true
        0 * userRepository.save(_)
        def e4 = thrown(ConflictException)
        e4.errorCode == "EMAIL_ALREADY_REGISTERED"
    }

    def "a unique-email violation lost in a race maps to EMAIL_ALREADY_REGISTERED, a primary-key one stays a DataIntegrityViolation"() {
        given:
        userRepository.findById(sub) >> Optional.empty()
        userRepository.existsByEmail(_) >> false
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        userRepository.save(_) >> { throw new DataIntegrityViolationException("x", new RuntimeException(detail)) }

        when:
        userService.provisionExternalUser(identity().build())

        then:
        def e = thrown(expected)
        if (e instanceof ConflictException) {
            assert e.errorCode == "EMAIL_ALREADY_REGISTERED"
        }

        where:
        detail                                                         | expected
        'duplicate key value violates unique constraint "users_email_key"' | ConflictException
        'duplicate key value violates unique constraint "users_pkey"'      | DataIntegrityViolationException
    }

    def "a taken username gets the subject's first characters as a suffix, within the 50 character column"() {
        given:
        def longName = "n" * 60

        when:
        userService.provisionExternalUser(identity().username(longName).build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail(_) >> false
        1 * userRepository.existsByUsername("n" * 50) >> true
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u ->
            u.username.length() == 50 && u.username.endsWith("-" + sub.toString().substring(0, 6))
        }) >> { User u -> u }
    }

    def "no username in the token leaves it null"() {
        when:
        userService.provisionExternalUser(identity().username(null).build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail(_) >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.username == null }) >> { User u -> u }
        0 * userRepository.existsByUsername(_)
    }

    def "a username that is an email address (the realm's email-as-username) is not copied: it is shown to other users"() {
        when:
        userService.provisionExternalUser(identity().username("a@example.com").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail(_) >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.username == null }) >> { User u -> u }
        0 * userRepository.existsByUsername(_)
    }

    // ---- A32: the register page's country / region / location, untrusted ----

    private User provisioned

    private void expectNewUser() {
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail(_) >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save(_) >> { User u -> provisioned = u; u }
        // the response resolves display names of a stored zone
        _ * referenceService.getCountriesByIds(_) >> [:]
        _ * referenceService.getRegionsByIds(_) >> [:]
    }

    def "a valid country, region and location claim are stored on the new user"() {
        when:
        userService.provisionExternalUser(identity().countryId(7L).regionId(70L).latitude(10.78d).longitude(106.69d).build())

        then:
        interaction { expectNewUser() }
        1 * referenceService.isValidSelection(7L, null) >> true
        1 * referenceService.isValidSelection(7L, 70L) >> true
        provisioned.countryId == 7L
        provisioned.regionId == 70L
        provisioned.location.x == 106.69d
        provisioned.location.y == 10.78d
        provisioned.location.SRID == 4326
    }

    def "an unknown or inactive country drops the country and the region, and the sign-in still provisions"() {
        when:
        userService.provisionExternalUser(identity().countryId(999L).regionId(70L).build())

        then:
        interaction { expectNewUser() }
        1 * referenceService.isValidSelection(999L, null) >> false
        0 * referenceService.isValidSelection(999L, 70L)
        provisioned.countryId == null
        provisioned.regionId == null
    }

    def "a valid country with a region that is not valid for it keeps the country and drops the region"() {
        when:
        userService.provisionExternalUser(identity().countryId(7L).regionId(80L).build())

        then:
        interaction { expectNewUser() }
        1 * referenceService.isValidSelection(7L, null) >> true
        1 * referenceService.isValidSelection(7L, 80L) >> false
        provisioned.countryId == 7L
        provisioned.regionId == null
    }

    def "a region without a country is dropped without asking the reference service"() {
        when:
        userService.provisionExternalUser(identity().regionId(70L).build())

        then:
        interaction { expectNewUser() }
        0 * referenceService.isValidSelection(*_)
        provisioned.countryId == null
        provisioned.regionId == null
    }

    def "a location is kept only as an in-range pair"() {
        when:
        userService.provisionExternalUser(identity().latitude(lat).longitude(lng).build())

        then:
        interaction { expectNewUser() }
        provisioned.location == null

        where:
        lat    | lng
        10.78d | null
        null   | 106.69d
        91d    | 106.69d
        -91d   | 106.69d
        10.78d | 181d
        10.78d | -181d
    }

    def "no geo claims leave the zone and the location empty and never touch the reference service for it"() {
        when:
        userService.provisionExternalUser(identity().build())

        then:
        interaction { expectNewUser() }
        0 * referenceService.isValidSelection(*_)
        provisioned.countryId == null
        provisioned.regionId == null
        provisioned.location == null
    }

    def "only a full name splits into first and last name; a given and family name win over it"() {
        when:
        userService.provisionExternalUser(identity().firstName(null).lastName(null).fullName("Tran Van Binh").build())

        then:
        1 * userRepository.findById(sub) >> Optional.empty()
        1 * userRepository.existsByEmail(_) >> false
        1 * roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        1 * userRepository.save({ User u -> u.firstName == "Tran" && u.lastName == "Van Binh" }) >> { User u -> u }
    }

    def "an active language becomes the preference (vi-VN falls back to vi); an unknown one is ignored"() {
        given:
        referenceService.isActiveLanguage("vi-VN") >> false
        referenceService.isActiveLanguage("vi") >> true
        referenceService.isActiveLanguage("zz") >> false
        userRepository.findById(sub) >> Optional.empty()
        userRepository.existsByEmail(_) >> false
        roleRepository.findByName(Role.USER) >> Optional.of(USER_ROLE)
        userRepository.save(_) >> { User u -> u }

        when:
        userService.provisionExternalUser(identity().languageCode(locale).build())

        then:
        saved * userPreferenceRepository.save({ UserPreference p -> p.userId == sub && p.language == "vi" })

        where:
        locale  | saved
        "vi-VN" | 1
        "vi"    | 1
        "zz"    | 0
        null    | 0
    }

    // ---- reactivateUser ----

    def "reactivateUser flips a deactivated account on and evicts the cached access state"() {
        given:
        def user = User.builder().id(sub).isActive(false).roles([USER_ROLE] as Set).build()

        when:
        def result = userService.reactivateUser(sub)

        then:
        1 * userRepository.findByIdForUpdate(sub) >> Optional.of(user)
        1 * userRepository.save({ User u -> u.isActive })
        1 * accessStateCache.evictAfterCommit(sub)
        result.isActive
    }

    def "reactivateUser leaves an active account alone"() {
        given:
        def user = User.builder().id(sub).isActive(true).roles([USER_ROLE] as Set).build()

        when:
        userService.reactivateUser(sub)

        then:
        1 * userRepository.findByIdForUpdate(sub) >> Optional.of(user)
        0 * userRepository.save(_)
        0 * accessStateCache.evictAfterCommit(_)
    }

    def "reactivateUser for an unknown id is a not-found"() {
        when:
        userService.reactivateUser(sub)

        then:
        1 * userRepository.findByIdForUpdate(sub) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }
}

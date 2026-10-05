package com.sportconnect.user.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest
import com.sportconnect.user.entity.UserPreference
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import spock.lang.Specification
import spock.lang.Subject

class UserPreferenceServiceImplSpec extends Specification {

    UserPreferenceRepository userPreferenceRepository = Mock()
    UserRepository userRepository = Mock()
    ReferenceService referenceService = Mock()

    @Subject
    UserPreferenceServiceImpl userPreferenceService = new UserPreferenceServiceImpl(userPreferenceRepository, userRepository, referenceService)

    UUID userId = UUID.randomUUID()

    // U16 defaults: the caller is active and en/vi are the active languages. A feature that needs the opposite
    // declares its own interaction in a then: block, which takes precedence over these.
    def setup() {
        userRepository.existsByIdAndIsActiveTrue(userId) >> true
        referenceService.isActiveLanguage("en") >> true
        referenceService.isActiveLanguage("vi") >> true
    }

    private UserPreference existingPreference() {
        UserPreference.builder()
                .id(1L)
                .userId(userId)
                .language("en")
                .timezone("UTC")
                .distanceUnit("km")
                .notificationEmail(true)
                .notificationPush(true)
                .notificationSms(false)
                .privacyProfile("public")
                .privacyLocation("friends")
                .build()
    }

    def "getPreferences creates a default row on first access"() {
        when:
        def result = userPreferenceService.getPreferences(userId)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.empty()
        1 * userPreferenceRepository.save({ UserPreference p -> p.userId == userId }) >> existingPreference()
        result.language == "en"
        result.distanceUnit == "km"
        result.privacyProfile == "public"
    }

    def "getPreferences returns the existing row without creating a new one"() {
        given:
        def preference = existingPreference()
        preference.language = "vi"

        when:
        def result = userPreferenceService.getPreferences(userId)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        0 * userPreferenceRepository.save(_)
        result.language == "vi"
    }

    def "updatePreferences creates a default row first when none exists, then applies changes"() {
        given:
        def request = UpdateUserPreferenceRequest.builder().language("vi").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.empty()
        1 * userPreferenceRepository.save({ UserPreference p -> p.userId == userId }) >> existingPreference()
        1 * userPreferenceRepository.save({ UserPreference p -> p.language == "vi" }) >> { UserPreference p -> p }
        result.language == "vi"
    }

    def "updatePreferences only changes supplied fields"() {
        given:
        def preference = existingPreference()
        def request = UpdateUserPreferenceRequest.builder().timezone("Asia/Ho_Chi_Minh").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save(_) >> { UserPreference p ->
            assert p.timezone == "Asia/Ho_Chi_Minh"
            assert p.language == "en"
            assert p.distanceUnit == "km"
            return p
        }
        result.timezone == "Asia/Ho_Chi_Minh"
        result.language == "en"
    }

    def "updatePreferences falls back to default when distanceUnit is invalid"() {
        given:
        def preference = existingPreference()
        def request = UpdateUserPreferenceRequest.builder().distanceUnit("furlongs").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save(_) >> { UserPreference p -> p }
        result.distanceUnit == "km"
    }

    def "updatePreferences falls back to default when privacyProfile is invalid"() {
        given:
        def preference = existingPreference()
        def request = UpdateUserPreferenceRequest.builder().privacyProfile("everyone").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save(_) >> { UserPreference p -> p }
        result.privacyProfile == "public"
    }

    def "updatePreferences falls back to default when privacyLocation is invalid"() {
        given:
        def preference = existingPreference()
        def request = UpdateUserPreferenceRequest.builder().privacyLocation("nobody").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save(_) >> { UserPreference p -> p }
        result.privacyLocation == "friends"
    }

    def "updatePreferences accepts valid distanceUnit as-is"() {
        given:
        def preference = existingPreference()
        def request = UpdateUserPreferenceRequest.builder().distanceUnit("mi").build()

        when:
        def result = userPreferenceService.updatePreferences(userId, request)

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save(_) >> { UserPreference p -> p }
        result.distanceUnit == "mi"
    }

    // ---------- U16: active-language validation ----------

    def "updatePreferences rejects a language that is not an active reference language, before touching any row"() {
        given:
        def request = UpdateUserPreferenceRequest.builder().language(language).build()

        when:
        userPreferenceService.updatePreferences(userId, request)

        then:
        def e = thrown(BadRequestException)
        e.message.contains(language)
        e.errorCode == "LANGUAGE_UNKNOWN"
        e.errorParams == [language: language]
        0 * userPreferenceRepository._

        where:
        language << ["zz", "fr", "VI", "not-a-language"]
    }

    def "updatePreferences accepts an active language and stores it"() {
        given:
        def preference = existingPreference()

        when:
        def result = userPreferenceService.updatePreferences(userId, UpdateUserPreferenceRequest.builder().language("vi").build())

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(preference)
        1 * userPreferenceRepository.save({ UserPreference p -> p.language == "vi" }) >> { UserPreference p -> p }
        result.language == "vi"
    }

    def "updatePreferences does not consult the reference languages when no language is supplied"() {
        when:
        userPreferenceService.updatePreferences(userId, UpdateUserPreferenceRequest.builder().timezone("UTC").build())

        then:
        1 * userPreferenceRepository.findByUserId(userId) >> Optional.of(existingPreference())
        1 * userPreferenceRepository.save(_) >> { UserPreference p -> p }
        0 * referenceService.isActiveLanguage(_)
    }

    // ---------- U16: a deactivated caller gets no further interaction ----------

    def "a deactivated (or unknown) caller is rejected on #action, before any row is created"() {
        when:
        switch (action) {
            case "read": userPreferenceService.getPreferences(userId); break
            case "write": userPreferenceService.updatePreferences(userId, UpdateUserPreferenceRequest.builder().timezone("UTC").build()); break
            case "write-language": userPreferenceService.updatePreferences(userId, UpdateUserPreferenceRequest.builder().language("vi").build()); break
        }

        then:
        1 * userRepository.existsByIdAndIsActiveTrue(userId) >> false
        thrown(ResourceNotFoundException)
        0 * userPreferenceRepository._
        0 * referenceService._

        where:
        action << ["read", "write", "write-language"]
    }
}

package com.sportconnect.user.service

import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest
import com.sportconnect.user.entity.UserPreference
import com.sportconnect.user.repository.UserPreferenceRepository
import spock.lang.Specification
import spock.lang.Subject

class UserPreferenceServiceImplSpec extends Specification {

    UserPreferenceRepository userPreferenceRepository = Mock()

    @Subject
    UserPreferenceServiceImpl userPreferenceService = new UserPreferenceServiceImpl(userPreferenceRepository)

    UUID userId = UUID.randomUUID()

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
}

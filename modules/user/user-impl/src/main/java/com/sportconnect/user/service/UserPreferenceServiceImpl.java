package com.sportconnect.user.service;

import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest;
import com.sportconnect.user.api.dto.UserPreferenceResponse;
import com.sportconnect.user.api.service.UserPreferenceService;
import com.sportconnect.user.entity.UserPreference;
import com.sportconnect.user.repository.UserPreferenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserPreferenceServiceImpl implements UserPreferenceService {

    private static final Set<String> VALID_DISTANCE_UNITS = Set.of("km", "mi");
    private static final Set<String> VALID_PRIVACY_VALUES = Set.of("public", "friends", "private");

    private final UserPreferenceRepository userPreferenceRepository;

    @Override
    @Transactional
    public UserPreferenceResponse getPreferences(UUID userId) {
        UserPreference preference = findOrCreate(userId);
        return toResponse(preference);
    }

    @Override
    @Transactional
    public UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request) {
        UserPreference preference = findOrCreate(userId);

        if (request.getLanguage() != null) {
            preference.setLanguage(request.getLanguage());
        }
        if (request.getTimezone() != null) {
            preference.setTimezone(request.getTimezone());
        }
        if (request.getDistanceUnit() != null) {
            preference.setDistanceUnit(VALID_DISTANCE_UNITS.contains(request.getDistanceUnit())
                    ? request.getDistanceUnit()
                    : "km");
        }
        if (request.getNotificationEmail() != null) {
            preference.setNotificationEmail(request.getNotificationEmail());
        }
        if (request.getNotificationPush() != null) {
            preference.setNotificationPush(request.getNotificationPush());
        }
        if (request.getNotificationSms() != null) {
            preference.setNotificationSms(request.getNotificationSms());
        }
        if (request.getPrivacyProfile() != null) {
            preference.setPrivacyProfile(VALID_PRIVACY_VALUES.contains(request.getPrivacyProfile())
                    ? request.getPrivacyProfile()
                    : "public");
        }
        if (request.getPrivacyLocation() != null) {
            preference.setPrivacyLocation(VALID_PRIVACY_VALUES.contains(request.getPrivacyLocation())
                    ? request.getPrivacyLocation()
                    : "friends");
        }

        UserPreference saved = userPreferenceRepository.save(preference);
        log.info("Updated preferences for user: {}", userId);
        return toResponse(saved);
    }

    private UserPreference findOrCreate(UUID userId) {
        return userPreferenceRepository.findByUserId(userId)
                .orElseGet(() -> userPreferenceRepository.save(
                        UserPreference.builder().userId(userId).build()));
    }

    private UserPreferenceResponse toResponse(UserPreference preference) {
        return UserPreferenceResponse.builder()
                .language(preference.getLanguage())
                .timezone(preference.getTimezone())
                .distanceUnit(preference.getDistanceUnit())
                .notificationEmail(preference.getNotificationEmail())
                .notificationPush(preference.getNotificationPush())
                .notificationSms(preference.getNotificationSms())
                .privacyProfile(preference.getPrivacyProfile())
                .privacyLocation(preference.getPrivacyLocation())
                .createdAt(preference.getCreatedAt())
                .updatedAt(preference.getUpdatedAt())
                .build();
    }
}

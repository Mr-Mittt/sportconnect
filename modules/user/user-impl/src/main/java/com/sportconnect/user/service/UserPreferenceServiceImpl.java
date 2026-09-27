package com.sportconnect.user.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.reference.api.service.ReferenceService;
import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest;
import com.sportconnect.user.api.dto.UserPreferenceResponse;
import com.sportconnect.user.api.service.UserPreferenceService;
import com.sportconnect.user.entity.UserPreference;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
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
    // U16: same-domain repository for the active-caller gate; cross-domain reference-api for the language check.
    private final UserRepository userRepository;
    private final ReferenceService referenceService;

    /**
     * {@inheritDoc}
     *
     * <p>U16: rejects a deactivated caller — the read auto-creates a row, so it is not a pure read, and the JWT
     * filter does not recheck {@code isActive} (U12's known gap).
     */
    @Override
    @Transactional
    public UserPreferenceResponse getPreferences(UUID userId) {
        requireActiveCaller(userId);
        UserPreference preference = findOrCreate(userId);
        return toResponse(preference);
    }

    /**
     * {@inheritDoc}
     *
     * <p>U16 — two new rules: the caller must still be active ({@code 404}, the same answer {@code updateProfile}
     * gives a deactivated caller), and {@code language}, when supplied, must be an active reference language code
     * ({@code 400}). Both are checked before the row is created or touched. Previously any string was accepted.
     */
    @Override
    @Transactional
    public UserPreferenceResponse updatePreferences(UUID userId, UpdateUserPreferenceRequest request) {
        requireActiveCaller(userId);
        if (request.getLanguage() != null && !referenceService.isActiveLanguage(request.getLanguage())) {
            throw new BadRequestException("Unknown or inactive language: " + request.getLanguage());
        }

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

    /** A deactivated (or unknown) user gets no further interaction — CLAUDE.md, Account lifecycle. */
    private void requireActiveCaller(UUID userId) {
        if (!userRepository.existsByIdAndIsActiveTrue(userId)) {
            throw new ResourceNotFoundException("User", "id", userId);
        }
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

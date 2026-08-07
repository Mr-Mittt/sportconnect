package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserSportProfileServiceImpl implements UserSportProfileService {

    private static final int MAX_ATTRIBUTES_BYTES = 4096;

    private final UserSportProfileRepository profileRepository;
    private final SportRepository sportRepository;
    private final SportService sportService;
    private final ObjectMapper objectMapper;

    /**
     * Creates a new sport profile for the caller.
     *
     * <p>Verifies the sport exists and is currently active (A6 — a deactivated sport, e.g. one
     * turned off for this MVP's launch scope, can no longer be selected for a <em>new</em> profile;
     * an existing profile referencing a sport that's deactivated later is left untouched, see
     * {@link SportServiceImpl#getSportById} and {@link SportServiceImpl#getSportsByIds}), enforces
     * the max-3-active-profiles-per-user rule, and rejects a duplicate (userId, sportId) pair.
     */
    @Override
    @Transactional
    public UserSportProfileResponse createProfile(UUID userId, CreateUserSportProfileRequest request) {
        // Verify sport exists
        Sport sport = sportRepository.findById(request.getSportId())
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", request.getSportId()));

        // Verify sport is active — a deactivated sport can't be picked for a new profile
        if (!sport.getIsActive()) {
            throw new BadRequestException("Sport '" + sport.getName() + "' is not currently active");
        }

        // Enforce max-3 active sport profiles per user
        if (profileRepository.findByUserIdAndIsActiveTrue(userId).size() >= 3) {
            throw new BadRequestException("User cannot have more than 3 sport profiles");
        }

        // Check if profile already exists
        if (profileRepository.existsByUserIdAndSportId(userId, request.getSportId())) {
            throw new BadRequestException("User already has a profile for sport: " + sport.getName());
        }

        Map<String, Object> attributes = request.getAttributes() != null
                ? new HashMap<>(request.getAttributes())
                : new HashMap<>();
        validateAttributesSize(attributes);

        UserSportProfile profile = UserSportProfile.builder()
                .userId(userId)
                .sportId(request.getSportId())
                .skillLevel(request.getSkillLevel())
                .yearsOfExperience(request.getYearsOfExperience())
                .preferredPosition(request.getPreferredPosition())
                .bio(request.getBio())
                .attributes(attributes)
                .isActive(true)
                .build();

        UserSportProfile savedProfile = profileRepository.save(profile);
        log.info("Created sport profile for user {} and sport {}", userId, sport.getName());
        return toUserSportProfileResponse(savedProfile, sport.getName());
    }

    @Override
    @Transactional(readOnly = true)
    public UserSportProfileResponse getProfileById(Long profileId) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));
        
        Sport sport = sportRepository.findById(profile.getSportId())
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", profile.getSportId()));
        
        return toUserSportProfileResponse(profile, sport.getName());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Resolves sport names via {@link SportService#getSportsByIds}, one batched call instead of
     * one per profile (A4 cleanliness fix — this list is bounded to ≤3 profiles by the
     * max-3-profiles rule in {@code createProfile}, so this was never a real N+1 scaling risk, see
     * {@code BACKLOG_MVP.md}). Routed through {@code SportService} rather than
     * {@code sportRepository} directly (A5) so this read path benefits from {@code SportLookupCache}
     * too, instead of hitting the database on every call.
     */
    @Override
    @Transactional(readOnly = true)
    public List<UserSportProfileResponse> getUserProfiles(UUID userId) {
        List<UserSportProfile> profiles = profileRepository.findByUserIdAndIsActiveTrue(userId);

        List<Long> sportIds = profiles.stream()
                .map(UserSportProfile::getSportId)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, SportResponse> sportsById = sportIds.isEmpty()
                ? Map.of()
                : sportService.getSportsByIds(sportIds);

        return profiles.stream()
                .map(profile -> toUserSportProfileResponse(profile,
                        sportsById.containsKey(profile.getSportId())
                                ? sportsById.get(profile.getSportId()).getName()
                                : "Unknown"))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public UserSportProfileResponse getUserProfileForSport(UUID userId, Long sportId) {
        UserSportProfile profile = profileRepository.findByUserIdAndSportId(userId, sportId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "userId and sportId", userId + ", " + sportId));
        
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));
        
        return toUserSportProfileResponse(profile, sport.getName());
    }

    @Override
    @Transactional
    public UserSportProfileResponse updateProfile(Long profileId, UUID callerId, CreateUserSportProfileRequest request) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));

        if (!profile.getUserId().equals(callerId)) {
            throw new ForbiddenException("You can only update your own sport profile");
        }

        if (request.getSkillLevel() != null) {
            profile.setSkillLevel(request.getSkillLevel());
        }
        if (request.getYearsOfExperience() != null) {
            profile.setYearsOfExperience(request.getYearsOfExperience());
        }
        if (request.getPreferredPosition() != null) {
            profile.setPreferredPosition(request.getPreferredPosition());
        }
        if (request.getBio() != null) {
            profile.setBio(request.getBio());
        }
        if (request.getAttributes() != null) {
            Map<String, Object> mergedAttributes = new HashMap<>(profile.getAttributes());
            mergedAttributes.putAll(request.getAttributes());
            validateAttributesSize(mergedAttributes);
            profile.setAttributes(mergedAttributes);
        }

        UserSportProfile updatedProfile = profileRepository.save(profile);
        
        Sport sport = sportRepository.findById(updatedProfile.getSportId())
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", updatedProfile.getSportId()));
        
        log.info("Updated sport profile {} for user {}", profileId, profile.getUserId());
        return toUserSportProfileResponse(updatedProfile, sport.getName());
    }

    @Override
    public boolean hasProfileForSport(UUID userId, Long sportId) {
        return profileRepository.existsByUserIdAndSportId(userId, sportId);
    }

    @Override
    @Transactional
    public void deleteProfile(Long profileId, UUID callerId) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));

        if (!profile.getUserId().equals(callerId)) {
            throw new ForbiddenException("You can only delete your own sport profile");
        }

        profile.setIsActive(false);
        profileRepository.save(profile);
        log.info("Soft deleted sport profile: {}", profileId);
    }

    private void validateAttributesSize(Map<String, Object> attributes) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(attributes);
            if (json.length > MAX_ATTRIBUTES_BYTES) {
                throw new BadRequestException("Sport profile attributes exceed the maximum allowed size (4KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid sport profile attributes");
        }
    }

    private UserSportProfileResponse toUserSportProfileResponse(UserSportProfile profile, String sportName) {
        return UserSportProfileResponse.builder()
                .id(profile.getId())
                .userId(profile.getUserId())
                .sportId(profile.getSportId())
                .sportName(sportName)
                .skillLevel(profile.getSkillLevel())
                .yearsOfExperience(profile.getYearsOfExperience())
                .preferredPosition(profile.getPreferredPosition())
                .bio(profile.getBio())
                .attributes(profile.getAttributes())
                .isActive(profile.getIsActive())
                .createdAt(profile.getCreatedAt())
                .updatedAt(profile.getUpdatedAt())
                .build();
    }
}

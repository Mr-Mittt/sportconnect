package com.sportconnect.sport.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserSportProfileServiceImpl implements UserSportProfileService {

    private final UserSportProfileRepository profileRepository;
    private final SportRepository sportRepository;

    @Override
    @Transactional
    public UserSportProfileResponse createProfile(UUID userId, CreateUserSportProfileRequest request) {
        // Verify sport exists
        Sport sport = sportRepository.findById(request.getSportId())
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", request.getSportId()));

        // Check if profile already exists
        if (profileRepository.existsByUserIdAndSportId(userId, request.getSportId())) {
            throw new BadRequestException("User already has a profile for sport: " + sport.getName());
        }

        UserSportProfile profile = UserSportProfile.builder()
                .userId(userId)
                .sportId(request.getSportId())
                .skillLevel(request.getSkillLevel())
                .yearsOfExperience(request.getYearsOfExperience())
                .preferredPosition(request.getPreferredPosition())
                .bio(request.getBio())
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

    @Override
    @Transactional(readOnly = true)
    public List<UserSportProfileResponse> getUserProfiles(UUID userId) {
        return profileRepository.findByUserIdAndIsActiveTrue(userId).stream()
                .map(profile -> {
                    Sport sport = sportRepository.findById(profile.getSportId()).orElse(null);
                    String sportName = sport != null ? sport.getName() : "Unknown";
                    return toUserSportProfileResponse(profile, sportName);
                })
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
    public UserSportProfileResponse updateProfile(Long profileId, CreateUserSportProfileRequest request) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));

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

        UserSportProfile updatedProfile = profileRepository.save(profile);
        
        Sport sport = sportRepository.findById(updatedProfile.getSportId())
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", updatedProfile.getSportId()));
        
        log.info("Updated sport profile {} for user {}", profileId, profile.getUserId());
        return toUserSportProfileResponse(updatedProfile, sport.getName());
    }

    @Override
    @Transactional
    public void deleteProfile(Long profileId) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));
        profile.setIsActive(false);
        profileRepository.save(profile);
        log.info("Soft deleted sport profile: {}", profileId);
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
                .isActive(profile.getIsActive())
                .createdAt(profile.getCreatedAt())
                .updatedAt(profile.getUpdatedAt())
                .build();
    }
}

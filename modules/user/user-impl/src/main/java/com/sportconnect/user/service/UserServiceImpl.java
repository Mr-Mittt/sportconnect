package com.sportconnect.user.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.LocationResponse;
import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserFriendshipStatus;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.dto.UserSearchResponse;
import com.sportconnect.user.api.service.UserFriendService;
import com.sportconnect.user.api.service.UserService;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserFriendService userFriendService;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUserById(UUID userId) {
        User user = userRepository.findByIdAndIsActiveTrue(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return toUserResponse(user);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds) {
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, this::toUserResponse));
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUserByEmail(String email) {
        User user = userRepository.findByEmailAndIsActiveTrue(email)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));
        return toUserResponse(user);
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUserByUsername(String username) {
        User user = userRepository.findByUsernameAndIsActiveTrue(username)
                .orElseThrow(() -> new ResourceNotFoundException("User", "username", username));
        return toUserResponse(user);
    }

    @Override
    @Transactional
    public UserResponse updateProfile(UUID userId, UUID callerId, UpdateProfileRequest request) {
        if (!userId.equals(callerId)) {
            throw new ForbiddenException("You can only update your own profile");
        }

        User user = userRepository.findByIdAndIsActiveTrue(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
        }
        if (request.getUsername() != null) {
            user.setUsername(request.getUsername());
        }
        if (request.getPhoneNumber() != null) {
            user.setPhoneNumber(request.getPhoneNumber());
        }
        if (request.getDateOfBirth() != null) {
            user.setDateOfBirth(request.getDateOfBirth());
        }
        if (request.getGender() != null) {
            user.setGender(request.getGender());
        }
        if (request.getBio() != null) {
            user.setBio(request.getBio());
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
        }
        if (request.getCoverUrl() != null) {
            user.setCoverUrl(request.getCoverUrl());
        }
        if (request.getLocation() != null) {
            Point point = geometryFactory.createPoint(
                new Coordinate(request.getLocation().getLongitude(), request.getLocation().getLatitude())
            );
            user.setLocation(point);
        }
        if (request.getCity() != null) {
            user.setCity(request.getCity());
        }
        if (request.getCountry() != null) {
            user.setCountry(request.getCountry());
        }
        if (request.getHeightCm() != null) {
            if (request.getHeightCm() < 50 || request.getHeightCm() > 300) {
                throw new BadRequestException("heightCm must be between 50 and 300");
            }
            user.setHeightCm(request.getHeightCm());
        }
        if (request.getWeightKg() != null) {
            if (request.getWeightKg().compareTo(BigDecimal.valueOf(20)) < 0
                    || request.getWeightKg().compareTo(BigDecimal.valueOf(300)) > 0) {
                throw new BadRequestException("weightKg must be between 20 and 300");
            }
            user.setWeightKg(request.getWeightKg());
        }
        if (request.getShoeSizeCm() != null) {
            if (request.getShoeSizeCm() < 10 || request.getShoeSizeCm() > 35) {
                throw new BadRequestException("shoeSizeCm must be between 10 and 35");
            }
            user.setShoeSizeCm(request.getShoeSizeCm());
        }

        User savedUser = userRepository.save(user);
        log.info("Updated profile for user: {}", userId);
        return toUserResponse(savedUser);
    }

    @Override
    @Transactional
    public void deleteUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setIsActive(false);
        userRepository.save(user);
        log.info("Soft deleted user: {}", userId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByEmail(String email) {
        return userRepository.existsByEmail(email);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByUsername(String username) {
        return userRepository.existsByUsername(username);
    }

    @Override
    @Transactional
    public UserResponse createUser(String email, String passwordHash, String firstName, String lastName, String phoneNumber) {
        User user = User.builder()
                .email(email)
                .passwordHash(passwordHash)
                .firstName(firstName)
                .lastName(lastName)
                .phoneNumber(phoneNumber)
                .isEmailVerified(false)
                .isActive(true)
                .build();

        // Assign default USER role
        Role userRole = roleRepository.findByName(Role.USER)
                .orElseThrow(() -> new RuntimeException("Default USER role not found"));
        user.addRole(userRole);

        User savedUser = userRepository.save(user);
        log.info("Created new user: {}", email);
        return toUserResponse(savedUser);
    }

    @Override
    @Transactional
    public void updateUserPassword(UUID userId, String newPasswordHash) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setPasswordHash(newPasswordHash);
        userRepository.save(user);
        log.info("Updated password for user: {}", userId);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<String> getUserRoles(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return user.getRoles().stream()
                .map(role -> role.getName())
                .collect(java.util.stream.Collectors.toSet());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean verifyPassword(String email, String rawPassword) {
        User user = userRepository.findByEmail(email)
                .orElse(null);
        if (user == null || !user.getIsActive()) {
            return false;
        }
        return passwordEncoder.matches(rawPassword, user.getPasswordHash());
    }

    @Override
    @Transactional
    public void updateLastLogin(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = userRepository.findByIdAndIsActiveTrue(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        log.info("Changed password for user: {}", userId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UserSearchResponse> searchUsers(UUID callerId, String keyword, Pageable pageable) {
        if (keyword == null || keyword.trim().length() < 2) {
            throw new BadRequestException("Search keyword must be at least 2 characters");
        }

        Page<User> users = userRepository.searchActiveUsers(callerId, keyword.trim(), pageable);

        Set<UUID> friendIds = new HashSet<>(userFriendService.getAcceptedFriendIds(callerId));
        Set<UUID> pendingSentTo = userFriendService.getPendingSentRequests(callerId).stream()
                .map(FriendRequestResponse::getReceiverId)
                .collect(Collectors.toSet());
        Set<UUID> pendingReceivedFrom = userFriendService.getPendingReceivedRequests(callerId).stream()
                .map(FriendRequestResponse::getSenderId)
                .collect(Collectors.toSet());

        return users.map(user -> UserSearchResponse.builder()
                .id(user.getId())
                .fullName(buildFullName(user))
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .city(user.getCity())
                .country(user.getCountry())
                .friendshipStatus(resolveFriendshipStatus(user.getId(), friendIds, pendingSentTo, pendingReceivedFrom))
                .build());
    }

    private UserFriendshipStatus resolveFriendshipStatus(
            UUID targetUserId, Set<UUID> friendIds, Set<UUID> pendingSentTo, Set<UUID> pendingReceivedFrom) {
        if (friendIds.contains(targetUserId)) {
            return UserFriendshipStatus.FRIENDS;
        }
        if (pendingSentTo.contains(targetUserId)) {
            return UserFriendshipStatus.PENDING_SENT;
        }
        if (pendingReceivedFrom.contains(targetUserId)) {
            return UserFriendshipStatus.PENDING_RECEIVED;
        }
        return UserFriendshipStatus.NONE;
    }

    private String buildFullName(User user) {
        if (user.getFirstName() != null && user.getLastName() != null) {
            return user.getFirstName() + " " + user.getLastName();
        }
        return user.getUsername() != null ? user.getUsername() : "Unknown";
    }

    private UserResponse toUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .username(user.getUsername())
                .phoneNumber(user.getPhoneNumber())
                .dateOfBirth(user.getDateOfBirth())
                .gender(user.getGender())
                .bio(user.getBio())
                .avatarUrl(user.getAvatarUrl())
                .coverUrl(user.getCoverUrl())
                .location(user.getLocation() != null ?
                    LocationResponse.of(user.getLocation().getY(), user.getLocation().getX()) : null)
                .heightCm(user.getHeightCm())
                .weightKg(user.getWeightKg())
                .shoeSizeCm(user.getShoeSizeCm())
                .isEmailVerified(user.getIsEmailVerified())
                .isActive(user.getIsActive())
                .roles(user.getRoles().stream()
                        .map(role -> role.getName())
                        .collect(Collectors.toSet()))
                .createdAt(user.getCreatedAt())
                .lastLoginAt(user.getLastLoginAt())
                .build();
    }
}

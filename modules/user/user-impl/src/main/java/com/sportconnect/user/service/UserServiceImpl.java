package com.sportconnect.user.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.Gender;
import com.sportconnect.user.api.dto.LocationResponse;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserFriendshipStatus;
import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.service.ReferenceService;
import com.sportconnect.user.api.dto.UserInfoResponse;
import com.sportconnect.user.api.dto.UserRegistrationDetails;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.dto.UserSummaryResponse;
import com.sportconnect.user.api.dto.UserSearchResponse;
import com.sportconnect.user.api.service.UserFriendService;
import com.sportconnect.user.api.service.UserService;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.entity.UserPreference;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserFriendService userFriendService;
    private final AuthService authService;
    private final UserSportProfileService userSportProfileService;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    // U16: cross-domain, interface only (reference-api depends on common alone, so no bean cycle).
    private final ReferenceService referenceService;
    private final UserPreferenceRepository userPreferenceRepository;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    /**
     * Explicit constructor (not {@code @RequiredArgsConstructor}) because {@code authService}
     * must be {@code @Lazy}: U12 made AuthServiceImpl depend on UserService (it already did) AND
     * UserServiceImpl depend on AuthService (new, for deleteUser()'s session revocation) — eager
     * construction of both beans forms a cycle Spring refuses to start with by default, same
     * class of problem as GroupServiceImpl's own {@code @Lazy PostService} (see that class for the
     * fuller explanation). authService is only used here for one call in deleteUser() — a lazy
     * proxy defers resolving the real AuthServiceImpl bean until that call actually happens, well
     * after both beans exist. Relying on Lombok to copy @Lazy onto a generated constructor
     * parameter is not guaranteed without a lombok.config entry, so this is spelled out by hand.
     */
    public UserServiceImpl(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder,
            UserFriendService userFriendService,
            @Lazy AuthService authService,
            UserSportProfileService userSportProfileService,
            StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper,
            ReferenceService referenceService,
            UserPreferenceRepository userPreferenceRepository) {
        this.referenceService = referenceService;
        this.userPreferenceRepository = userPreferenceRepository;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.userFriendService = userFriendService;
        this.authService = authService;
        this.userSportProfileService = userSportProfileService;
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
    }

    // services/chat (the first non-Java service in this repo) consumes this stream to keep its
    // own local authorization cache in sync — see services/chat/docs/SYNC_DESIGN.md.
    private static final String DOMAIN_EVENTS_STREAM = "sportconnect:domain-events";
    private static final int DOMAIN_EVENT_SCHEMA_VERSION = 1;

    /**
     * Publishes one domain-change event to {@link #DOMAIN_EVENTS_STREAM} for services/chat to
     * consume. Never lets a publish failure break the domain operation it's attached to — chat's
     * cold-start bootstrap exists precisely to recover from a gap like a transient Redis outage,
     * so this only logs and moves on rather than rolling back or rethrowing.
     */
    private void publishDomainEvent(String eventType, Object payload) {
        try {
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("event_id", UUID.randomUUID().toString());
            fields.put("event_type", eventType);
            fields.put("schema_version", String.valueOf(DOMAIN_EVENT_SCHEMA_VERSION));
            fields.put("occurred_at", Instant.now().toString());
            fields.put("payload", objectMapper.writeValueAsString(payload));

            MapRecord<String, String, String> record = StreamRecords.newRecord()
                    .ofMap(fields)
                    .withStreamKey(DOMAIN_EVENTS_STREAM);
            stringRedisTemplate.opsForStream().add(record);
        } catch (Exception e) {
            log.warn("Failed to publish domain event {} for chat sync: {}", eventType, e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUserById(UUID userId) {
        User user = userRepository.findByIdAndIsActiveTrue(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return toUserResponse(user);
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getActiveUserForUpdate(UUID userId) {
        User user = userRepository.findByIdAndIsActiveTrueForShare(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return toUserResponse(user);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, UserResponse> getUsersByIds(List<UUID> userIds) {
        // U16: intentionally NOT resolved (GeoNames.NONE) — see the interface Javadoc. The ids are still set.
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, user -> toUserResponse(user, GeoNames.NONE)));
    }

    /** {@inheritDoc} Same one-query, no-active-filter contract as {@link #getUsersByIds}, narrowed to the DTO. */
    @Override
    @Transactional(readOnly = true)
    public Map<UUID, UserSummaryResponse> getUserSummariesByIds(List<UUID> userIds) {
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, user -> UserSummaryResponse.builder()
                        .id(user.getId())
                        .fullName(user.getFullName())
                        .avatarUrl(user.getAvatarUrl())
                        .build()));
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

    /**
     * {@inheritDoc}
     *
     * <p>Cross-domain: calls {@code sport-api}'s active-only
     * {@link UserSportProfileService#getUserProfiles(UUID)} once and maps to sport ids. No
     * {@code sorted()} — {@code getUserProfiles} gives no order guarantee and the client sorts for
     * display; {@code distinct()} is defensive only (one profile per {@code (userId, sportId)} is
     * already enforced). Returns {@code activeSportIds = []} for a user with no active profiles.
     */
    @Override
    @Transactional(readOnly = true)
    public UserInfoResponse toPublicUserInfo(UserResponse user) {
        List<Long> activeSportIds = userSportProfileService.getUserProfiles(user.getId()).stream()
                .map(UserSportProfileResponse::getSportId)
                .distinct()
                .toList();
        return UserInfoResponse.of(user, activeSportIds);
    }

    @Override
    @Transactional
    public UserResponse updateProfile(UUID userId, UUID callerId, UpdateProfileRequest request) {
        if (!userId.equals(callerId)) {
            throw new ForbiddenException("USER_PROFILE_NOT_OWNED", "You can only update your own profile", null);
        }

        User user = userRepository.findByIdAndIsActiveTrue(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // U16: validated first so a bad selection fails before any other field is touched.
        applyGeoSelection(user, request);
        // U20: same reasoning - validated before any field is touched, so a bad gender saves nothing.
        String resolvedGender = resolveGender(request.getGender());

        // Captured before mutation so the publish below only fires when a field services/chat
        // actually displays (name/username/avatar) really changed — not on every profile save.
        String previousFirstName = user.getFirstName();
        String previousLastName = user.getLastName();
        String previousUsername = user.getUsername();
        String previousAvatarUrl = user.getAvatarUrl();

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
            user.setGender(resolvedGender);
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
        if (request.getHeightCm() != null) {
            if (request.getHeightCm() < 50 || request.getHeightCm() > 300) {
                throw new BadRequestException("HEIGHT_OUT_OF_RANGE", "heightCm must be between 50 and 300", Map.of("min", 50, "max", 300));
            }
            user.setHeightCm(request.getHeightCm());
        }
        if (request.getWeightKg() != null) {
            if (request.getWeightKg().compareTo(BigDecimal.valueOf(20)) < 0
                    || request.getWeightKg().compareTo(BigDecimal.valueOf(300)) > 0) {
                throw new BadRequestException("WEIGHT_OUT_OF_RANGE", "weightKg must be between 20 and 300", Map.of("min", 20, "max", 300));
            }
            user.setWeightKg(request.getWeightKg());
        }
        if (request.getShoeSizeMm() != null) {
            if (request.getShoeSizeMm() < 10 || request.getShoeSizeMm() > 500) {
                throw new BadRequestException("SHOE_SIZE_OUT_OF_RANGE", "shoeSizeMm must be between 10 and 500", Map.of("min", 10, "max", 500));
            }
            user.setShoeSizeMm(request.getShoeSizeMm());
        }

        User savedUser = userRepository.save(user);

        boolean displayableFieldChanged = !Objects.equals(previousFirstName, savedUser.getFirstName())
                || !Objects.equals(previousLastName, savedUser.getLastName())
                || !Objects.equals(previousUsername, savedUser.getUsername())
                || !Objects.equals(previousAvatarUrl, savedUser.getAvatarUrl());
        if (displayableFieldChanged) {
            publishDomainEvent("user.profile_updated", Map.of(
                    "user_id", userId.toString(),
                    "full_name", savedUser.getFullName(),
                    "username", savedUser.getUsername() != null ? savedUser.getUsername() : "",
                    "avatar_url", savedUser.getAvatarUrl() != null ? savedUser.getAvatarUrl() : ""));
        }

        log.info("Updated profile for user: {}", userId);
        return toUserResponse(savedUser);
    }

    /**
     * Soft delete (isActive=false) plus U12's session-revocation follow-through, in one
     * transaction. {@code findByIdForUpdate} takes an exclusive row lock held until this
     * transaction commits — deliberately acquired <em>before</em> {@link #authService}'s revoke
     * call touches {@code refresh_tokens}, matching the same "users row first, refresh_tokens
     * second" lock order {@code AuthServiceImpl.refreshToken()} now also follows, so the two can
     * never deadlock on each other. While this lock is held, a concurrent
     * {@code getActiveUserForUpdate} (a racing refresh for this same user) blocks until this
     * transaction commits, then correctly observes {@code isActive = false} instead of racing
     * ahead on stale data. See U12's implementation doc for the full race analysis this closes.
     */
    @Override
    @Transactional
    public void deleteUser(UUID userId) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setIsActive(false);
        userRepository.save(user);
        authService.logout(userId);
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

    /** {@inheritDoc} Delegates to the detailed overload with no extras. */
    @Override
    @Transactional
    public UserResponse createUser(String email, String passwordHash, String firstName, String lastName, String phoneNumber) {
        return createUser(email, passwordHash, firstName, lastName, phoneNumber, null);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Validation order matters: the geo selection and the language are checked, and the coordinate pair
     * verified, <em>before</em> {@code userRepository.save} — so a {@code 400} leaves no user behind (and the
     * enclosing {@code register} transaction rolls back regardless). The optional {@link UserPreference} row is
     * written in the same transaction as the user.
     */
    @Override
    @Transactional
    public UserResponse createUser(String email, String passwordHash, String firstName, String lastName, String phoneNumber,
                                   UserRegistrationDetails details) {
        UserRegistrationDetails extras = details != null ? details : new UserRegistrationDetails();

        referenceService.requireValidSelection(extras.getCountryId(), extras.getRegionId());

        String languageCode = extras.getLanguageCode() == null || extras.getLanguageCode().isBlank()
                ? null : extras.getLanguageCode().trim();
        if (languageCode != null && !referenceService.isActiveLanguage(languageCode)) {
            throw new BadRequestException("LANGUAGE_UNKNOWN", "Unknown or inactive language: " + languageCode, Map.of("language", languageCode));
        }

        Point location = toPoint(extras.getLatitude(), extras.getLongitude());

        User user = User.builder()
                .email(email)
                .passwordHash(passwordHash)
                .firstName(firstName)
                .lastName(lastName)
                .phoneNumber(phoneNumber)
                .countryId(extras.getCountryId())
                .regionId(extras.getRegionId())
                .location(location)
                .isEmailVerified(false)
                .isActive(true)
                .build();

        // Assign default USER role
        Role userRole = roleRepository.findByName(Role.USER)
                .orElseThrow(() -> new RuntimeException("Default USER role not found"));
        user.addRole(userRole);

        User savedUser = userRepository.save(user);
        if (languageCode != null) {
            userPreferenceRepository.save(UserPreference.builder()
                    .userId(savedUser.getId())
                    .language(languageCode)
                    .build());
        }
        log.info("Created new user: {}", email);
        return toUserResponse(savedUser);
    }

    /**
     * U20: validates the {@code gender} part of a profile update. Callers apply the result only when the request's
     * gender is non-null ({@code null} = skip).
     *
     * @param requested the raw {@code UpdateProfileRequest.gender}
     * @return the {@link Gender} name to store; {@code null} for the empty string (clear) or for a {@code null}
     *         request (nothing to store)
     * @throws BadRequestException if non-empty and not exactly one of {@link Gender}'s names (case-sensitive)
     */
    private String resolveGender(String requested) {
        if (requested == null || requested.isEmpty()) {
            return null;
        }
        return Gender.fromWire(requested)
                .map(Gender::name)
                .orElseThrow(() -> new BadRequestException("GENDER_INVALID", "gender must be one of: MALE, FEMALE", Map.of("allowed", List.of("MALE", "FEMALE"))));
    }

    /**
     * U16: applies the country/region part of a profile update. Nothing to do unless the request names a country
     * or a region. A present {@code countryId} makes {@code regionId} <em>replace</em> the stored region (absent =
     * cleared); a lone {@code regionId} is validated against the stored country. The rules themselves live in
     * {@link ReferenceService#requireValidSelection}, which throws {@code BadRequestException}.
     */
    private void applyGeoSelection(User user, UpdateProfileRequest request) {
        if (request.getCountryId() == null && request.getRegionId() == null) {
            return;
        }
        Long countryId = request.getCountryId() != null ? request.getCountryId() : user.getCountryId();
        referenceService.requireValidSelection(countryId, request.getRegionId());
        user.setCountryId(countryId);
        user.setRegionId(request.getRegionId());
    }

    /**
     * A WGS 84 point (X = longitude, Y = latitude) or {@code null} for neither. Only one of the pair, or a value
     * out of range, is a {@code 400} — the request DTO validates the same rules, this guards direct callers.
     */
    private Point toPoint(Double latitude, Double longitude) {
        if (latitude == null && longitude == null) {
            return null;
        }
        if (latitude == null || longitude == null) {
            throw new BadRequestException("LOCATION_INCOMPLETE", "latitude and longitude must be provided together", null);
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new BadRequestException("LOCATION_OUT_OF_RANGE", "latitude must be between -90 and 90 and longitude between -180 and 180", null);
        }
        return geometryFactory.createPoint(new Coordinate(longitude, latitude));
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
            throw new BadRequestException("CURRENT_PASSWORD_INCORRECT", "Current password is incorrect", null);
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        log.info("Changed password for user: {}", userId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UserSearchResponse> searchUsers(UUID callerId, String keyword, Pageable pageable) {
        if (keyword == null || keyword.trim().length() < 2) {
            throw new BadRequestException("SEARCH_KEYWORD_TOO_SHORT", "Search keyword must be at least 2 characters", Map.of("min", 2));
        }

        Page<User> users = userRepository.searchActiveUsers(callerId, keyword.trim(), pageable);

        Set<UUID> friendIds = new HashSet<>(userFriendService.getAcceptedFriendIds(callerId));
        Set<UUID> pendingSentTo = userFriendService.getPendingSentRequests(callerId).stream()
                .map(FriendRequestResponse::getReceiverId)
                .collect(Collectors.toSet());
        Set<UUID> pendingReceivedFrom = userFriendService.getPendingReceivedRequests(callerId).stream()
                .map(FriendRequestResponse::getSenderId)
                .collect(Collectors.toSet());

        // U16: resolve every country name on the page with ONE reference lookup, before the per-row map (N+1 rule).
        GeoNames geoNames = resolveGeoNames(users.getContent());

        return users.map(user -> UserSearchResponse.builder()
                .id(user.getId())
                .fullName(buildFullName(user))
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .city(user.getCity())
                .country(geoNames.countryName(user))
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

    /**
     * Country / region display names for a set of users, resolved from the reference domain. {@link #NONE} is
     * the "do not resolve" instance used by {@link #getUsersByIds}. The fallback is the legacy free text, so a user
     * whose text matched no country row (or who has not linked one) still shows what they typed.
     */
    private record GeoNames(Map<Long, CountryResponse> countries, Map<Long, RegionResponse> regions) {

        static final GeoNames NONE = new GeoNames(Map.of(), Map.of());

        /** Linked country's English name, else the legacy text, else {@code null}. */
        String countryName(User user) {
            CountryResponse country = user.getCountryId() != null ? countries.get(user.getCountryId()) : null;
            return country != null ? country.getName() : user.getCountry();
        }

        String regionName(User user) {
            RegionResponse region = user.getRegionId() != null ? regions.get(user.getRegionId()) : null;
            return region != null ? region.getName() : null;
        }
    }

    /**
     * One {@code getCountriesByIds} and one {@code getRegionsByIds} call for all the users, however many — and no
     * call at all when none has a link. The batch lookups include deactivated rows, so a user still shows the name
     * of a since-deactivated country or region.
     */
    private GeoNames resolveGeoNames(Collection<User> users) {
        Set<Long> countryIds = users.stream().map(User::getCountryId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> regionIds = users.stream().map(User::getRegionId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (countryIds.isEmpty() && regionIds.isEmpty()) {
            return GeoNames.NONE;
        }
        return new GeoNames(
                countryIds.isEmpty() ? Map.of() : referenceService.getCountriesByIds(countryIds),
                regionIds.isEmpty() ? Map.of() : referenceService.getRegionsByIds(regionIds));
    }

    /** Single-user mapping: resolves the names (at most two reference lookups). */
    private UserResponse toUserResponse(User user) {
        return toUserResponse(user, resolveGeoNames(List.of(user)));
    }

    private UserResponse toUserResponse(User user, GeoNames geoNames) {
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
                .city(user.getCity())
                .country(geoNames.countryName(user))
                .countryId(user.getCountryId())
                .regionId(user.getRegionId())
                .regionName(geoNames.regionName(user))
                .heightCm(user.getHeightCm())
                .weightKg(user.getWeightKg())
                .shoeSizeMm(user.getShoeSizeMm())
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

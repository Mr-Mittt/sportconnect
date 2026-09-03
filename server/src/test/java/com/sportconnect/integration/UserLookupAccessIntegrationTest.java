package com.sportconnect.integration;

import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;

import java.util.UUID;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U11 end-to-end coverage: the three lookup endpoints ({@code /{userId}}, {@code /email/{email}},
 * {@code /username/{username}}) and the two {@code check/*} availability endpoints must reject an
 * anonymous caller, and the three lookups must never leak a PII field
 * ({@code email}/{@code phoneNumber}/{@code dateOfBirth}/{@code gender}/{@code heightCm}/
 * {@code weightKg}/{@code shoeSizeCm}/{@code location}/{@code lastLoginAt}/{@code roles}/
 * {@code isEmailVerified}/{@code isActive}) even to an authenticated caller looking up someone
 * else. {@code GET /api/users/me} is covered separately — it's the one endpoint that's supposed
 * to return the full shape, for the caller's own id only.
 *
 * <p>{@code UserServiceImplSpec} covers {@code toUserResponse}'s field mapping with the repository
 * mocked; this class exists because only a real request through {@code SecurityConfig} +
 * {@code UserController}'s {@code @PreAuthorize} annotations proves the endpoints are actually
 * gated, and only a real serialized JSON body proves {@code UserInfoResponse} narrows what a
 * caller actually receives over the wire.
 */
class UserLookupAccessIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID targetUserId;
    private UUID callerId;
    private Long badmintonId;
    private Long pickleballId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();

        targetUserId = userRepository.save(User.builder()
                .email("u11-target@example.com")
                .passwordHash("hash")
                .firstName("Target")
                .lastName("User")
                .username("u11target")
                .bio("Weekend baller.")
                .avatarUrl("https://example.com/avatar.png")
                .coverUrl("https://example.com/cover.png")
                .phoneNumber("+15551234567")
                .isActive(true)
                .build()).getId();

        callerId = userRepository.save(User.builder()
                .email("u11-caller@example.com")
                .passwordHash("hash")
                .firstName("Caller")
                .lastName("User")
                .username("u11caller")
                .isActive(true)
                .build()).getId();

        // U15: the target holds active profiles in two sports and one soft-deleted profile in a
        // third — activeSportIds must carry exactly the two active sport ids.
        badmintonId = sportRepository.save(Sport.builder().name("U15 Badminton").isActive(true).build()).getId();
        pickleballId = sportRepository.save(Sport.builder().name("U15 Pickleball").isActive(true).build()).getId();
        Long tennisId = sportRepository.save(Sport.builder().name("U15 Tennis").isActive(true).build()).getId();

        profileRepository.save(UserSportProfile.builder()
                .userId(targetUserId).sportId(badmintonId).skillLevel("Intermediate").isActive(true).build());
        profileRepository.save(UserSportProfile.builder()
                .userId(targetUserId).sportId(pickleballId).skillLevel("Beginner").isActive(true).build());
        profileRepository.save(UserSportProfile.builder()
                .userId(targetUserId).sportId(tennisId).skillLevel("Advanced").isActive(false).build());

        evictSportCache();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    @Test
    void getUserById_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/{userId}", targetUserId).with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getUserById_withAuth_returnsSafeSubsetOnly() throws Exception {
        authenticateAs(callerId);

        mockMvc.perform(get("/api/users/{userId}", targetUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(targetUserId.toString()))
                .andExpect(jsonPath("$.data.fullName").value("Target User"))
                .andExpect(jsonPath("$.data.username").value("u11target"))
                .andExpect(jsonPath("$.data.avatarUrl").value("https://example.com/avatar.png"))
                .andExpect(jsonPath("$.data.coverUrl").value("https://example.com/cover.png"))
                .andExpect(jsonPath("$.data.bio").value("Weekend baller."))
                // U15: exactly the two ACTIVE sport ids (the soft-deleted third profile is excluded),
                // membership only — getUserProfiles gives no order guarantee.
                .andExpect(jsonPath("$.data.activeSportIds", hasSize(2)))
                .andExpect(jsonPath("$.data.activeSportIds",
                        containsInAnyOrder(badmintonId.intValue(), pickleballId.intValue())))
                .andExpect(jsonPath("$.data.email").doesNotExist())
                .andExpect(jsonPath("$.data.phoneNumber").doesNotExist())
                .andExpect(jsonPath("$.data.dateOfBirth").doesNotExist())
                .andExpect(jsonPath("$.data.gender").doesNotExist())
                .andExpect(jsonPath("$.data.heightCm").doesNotExist())
                .andExpect(jsonPath("$.data.weightKg").doesNotExist())
                .andExpect(jsonPath("$.data.shoeSizeCm").doesNotExist())
                .andExpect(jsonPath("$.data.location").doesNotExist())
                .andExpect(jsonPath("$.data.lastLoginAt").doesNotExist())
                .andExpect(jsonPath("$.data.roles").doesNotExist())
                .andExpect(jsonPath("$.data.isEmailVerified").doesNotExist())
                .andExpect(jsonPath("$.data.isActive").doesNotExist());
    }

    @Test
    void getUserByEmail_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/email/{email}", "u11-target@example.com").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getUserByEmail_withAuth_returnsSafeSubsetOnly() throws Exception {
        authenticateAs(callerId);

        mockMvc.perform(get("/api/users/email/{email}", "u11-target@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("u11target"))
                .andExpect(jsonPath("$.data.activeSportIds",
                        containsInAnyOrder(badmintonId.intValue(), pickleballId.intValue())))
                .andExpect(jsonPath("$.data.email").doesNotExist())
                .andExpect(jsonPath("$.data.phoneNumber").doesNotExist());
    }

    @Test
    void getUserByUsername_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/username/{username}", "u11target").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getUserByUsername_withAuth_returnsSafeSubsetOnly() throws Exception {
        authenticateAs(callerId);

        mockMvc.perform(get("/api/users/username/{username}", "u11target"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("u11target"))
                .andExpect(jsonPath("$.data.activeSportIds",
                        containsInAnyOrder(badmintonId.intValue(), pickleballId.intValue())))
                .andExpect(jsonPath("$.data.email").doesNotExist())
                .andExpect(jsonPath("$.data.phoneNumber").doesNotExist());
    }

    @Test
    void getUserById_userWithNoActiveSportProfiles_returnsEmptyActiveSportIds() throws Exception {
        authenticateAs(targetUserId); // caller looks up the "caller" fixture, who has no sport profiles

        mockMvc.perform(get("/api/users/{userId}", callerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(callerId.toString()))
                .andExpect(jsonPath("$.data.activeSportIds", hasSize(0)));
    }

    @Test
    void getMe_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/me").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getMe_withAuth_returnsCallersOwnFullProfile() throws Exception {
        authenticateAs(callerId);

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(callerId.toString()))
                .andExpect(jsonPath("$.data.email").value("u11-caller@example.com"))
                .andExpect(jsonPath("$.data.username").value("u11caller"));
    }

    @Test
    void checkEmailExists_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/check/email").param("email", "u11-target@example.com").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void checkUsernameExists_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/check/username").param("username", "u11target").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }
}

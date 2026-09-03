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
import org.springframework.http.MediaType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A20 end-to-end. Two halves that {@code UserSportProfileServiceImplSpec} (request object built
 * directly, repository mocked) cannot prove:
 *
 * <ul>
 *   <li><strong>Resume:</strong> {@code POST /api/sports/profiles} with {@code isResume:true} and a
 *       body full of different values reactivates the soft-deleted row through the real pipeline,
 *       keeping the stored scalars and only pruning stored {@code attributes} to the live schema —
 *       nothing from the request body applied. And {@code isResume:true} with nothing to resume is a
 *       real {@code 400}.</li>
 *   <li><strong>Caller-scoped list (A22):</strong> {@code GET /api/sports/profiles} has no
 *       {@code {userId}} path param — the owner is the authenticated principal. {@code 401} for an
 *       anonymous caller; an authenticated caller sees only their own rows (never another user's),
 *       and with {@code ?includeInactive=true} also their soft-deleted rows. Supersedes A20's
 *       owner-gated {@code GET /api/sports/profiles/user/{userId}}.</li>
 *   <li><strong>Caller-scoped per-sport read (A22):</strong> {@code GET /api/sports/profiles/sport/{sportId}}
 *       returns the caller's own profile for that sport — {@code 200} when they have one,
 *       {@code 404} when they don't (or the sport is inactive), {@code 401} anonymous. Supersedes
 *       the previously-public {@code GET /api/sports/profiles/user/{userId}/sport/{sportId}}.</li>
 *   <li><strong>Owner-only get-by-id gate (A21):</strong>
 *       {@code GET /api/sports/profiles/{profileId}} is owner-only —
 *       {@code 200} owner, {@code 403} other authenticated user, {@code 401} anonymous,
 *       {@code 404} for a missing id resolved before the ownership check.</li>
 * </ul>
 *
 * <p>{@link #cacheManager} is cleared per test — {@code SportLookupCache} holds the sport map (and
 * each sport's schema) with no TTL.
 */
class SportProfileResumeAndVisibilityIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID ownerId;
    private UUID otherUserId;
    private Long sportId;
    private Long sportId2;

    @BeforeEach
    void setUp() {
        clearAll();
        ownerId = userRepository.save(User.builder()
                .email("a20-owner@example.com").passwordHash("hash").firstName("A20").lastName("Owner")
                .username("a20owner").isActive(true).build()).getId();
        otherUserId = userRepository.save(User.builder()
                .email("a20-other@example.com").passwordHash("hash").firstName("A20").lastName("Other")
                .username("a20other").isActive(true).build()).getId();
        sportId = sportRepository.save(Sport.builder()
                .name("A20 Badminton").isActive(true)
                .attributesSchema(schemaWith("racket", "grip"))
                .build()).getId();
        sportId2 = sportRepository.save(Sport.builder()
                .name("A20 Pickleball").isActive(true)
                .build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDown() {
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

    /** A minimal stored schema document — one group, each named key a live {@code STRING} attribute. */
    private static Map<String, Object> schemaWith(String... keys) {
        List<Map<String, Object>> attributes = new ArrayList<>();
        int order = 1;
        for (String key : keys) {
            attributes.add(Map.of(
                    "key", key, "label", Map.of("en", key), "type", "STRING",
                    "isAvailable", true, "order", order++));
        }
        return Map.of(
                "defaultLocale", "en",
                "groups", List.of(Map.of(
                        "key", "gear", "label", Map.of("en", "Gear"),
                        "isAvailable", true, "order", 1, "attributes", attributes)));
    }

    private Long storedProfile(Long sport, boolean active, String skillLevel, Map<String, Object> attributes) {
        return storedProfileForUser(ownerId, sport, active, skillLevel, attributes);
    }

    private Long storedProfileForUser(UUID userId, Long sport, boolean active, String skillLevel,
            Map<String, Object> attributes) {
        return profileRepository.save(UserSportProfile.builder()
                .userId(userId).sportId(sport).skillLevel(skillLevel).bio("stored bio")
                .preferredPosition("Net").yearsOfExperience(4)
                .isActive(active)
                .attributes(new HashMap<>(attributes))
                .build()).getId();
    }

    // ---- Resume ----

    @Test
    void resume_keepsStoredScalarsAndPrunedAttributes_ignoringTheRequestBody() throws Exception {
        // legacyKey is not in schemaWith("racket", "grip") — an orphan from a since-deleted definition.
        Long profileId = storedProfile(sportId, false, "Intermediate",
                Map.of("racket", "Yonex", "legacyKey", "orphan"));
        authenticateAs(ownerId);

        String body = "{\"sportId\":" + sportId + ",\"isResume\":true,"
                + "\"skillLevel\":\"IGNORED\",\"bio\":\"IGNORED\",\"yearsOfExperience\":99,"
                + "\"attributes\":{\"grip\":\"tight\"}}";

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(profileId.intValue()))
                .andExpect(jsonPath("$.data.isActive").value(true))
                // stored scalars survive; request body values are not applied
                .andExpect(jsonPath("$.data.skillLevel").value("Intermediate"))
                .andExpect(jsonPath("$.data.bio").value("stored bio"))
                .andExpect(jsonPath("$.data.yearsOfExperience").value(4))
                // attributes = retainDefined(stored): racket kept, orphan pruned, request's grip NOT merged
                .andExpect(jsonPath("$.data.attributes.racket").value("Yonex"))
                .andExpect(jsonPath("$.data.attributes.legacyKey").doesNotExist())
                .andExpect(jsonPath("$.data.attributes.grip").doesNotExist());

        // Same after a real re-read through the JSON column.
        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isActive").value(true))
                .andExpect(jsonPath("$.data.skillLevel").value("Intermediate"))
                .andExpect(jsonPath("$.data.attributes.racket").value("Yonex"))
                .andExpect(jsonPath("$.data.attributes.legacyKey").doesNotExist())
                .andExpect(jsonPath("$.data.attributes.grip").doesNotExist());
    }

    @Test
    void resume_withNoDeactivatedProfile_is400() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId2 + ",\"isResume\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No deactivated profile to resume for sport: A20 Pickleball"));
    }

    @Test
    void ordinaryCreate_withoutSkillLevel_still400s_despiteTheRelaxedNotNull() throws Exception {
        // A20 dropped skillLevel's @NotNull for the isResume path; the @AssertTrue cross-field
        // check must still reject an ordinary (isResume-absent) create that omits it.
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId2 + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed"));
    }

    // ---- A22: caller-scoped list (GET /api/sports/profiles) + includeInactive ----

    @Test
    void list_callerWithIncludeInactive_seesBothActiveAndSoftDeletedRows() throws Exception {
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));
        Long deletedId = storedProfile(sportId2, false, "Beginner", Map.of());
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles")
                        .param("includeInactive", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[?(@.isActive == false)].id").value(deletedId.intValue()));
    }

    @Test
    void list_callerWithoutFlag_omitsSoftDeletedRows() throws Exception {
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));
        storedProfile(sportId2, false, "Beginner", Map.of());
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].isActive").value(true));
    }

    @Test
    void list_authenticated_returnsOnlyTheCallersOwnRows() throws Exception {
        // A22 removed the {userId} param: the endpoint is scoped to the principal, so there is no
        // "another user's list" to 403 on — the caller simply never sees rows that aren't theirs.
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));          // ownerId
        Long othersProfileId = storedProfileForUser(otherUserId, sportId2, true, "Beginner", Map.of());
        authenticateAs(otherUserId);

        mockMvc.perform(get("/api/sports/profiles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(othersProfileId.intValue()))
                .andExpect(jsonPath("$.data[0].sportId").value(sportId2.intValue()));
    }

    @Test
    void list_anonymous_is401() throws Exception {
        // A22 replaced A20's "/api/sports/profiles/user/*" matcher with an exact
        // "/api/sports/profiles" matcher ahead of the /api/sports/** permitAll, so an anonymous
        // caller is rejected by the filter chain (jwtAuthenticationEntryPoint → 401) before
        // reaching the controller.
        mockMvc.perform(get("/api/sports/profiles").with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    // ---- A22: caller-scoped per-sport read (GET /api/sports/profiles/sport/{sportId}) ----

    @Test
    void getForSport_callerWithProfile_is200() throws Exception {
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/sport/{sportId}", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sportId").value(sportId.intValue()))
                .andExpect(jsonPath("$.data.skillLevel").value("Advanced"));
    }

    @Test
    void getForSport_callerWithoutProfile_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/sport/{sportId}", sportId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getForSport_readsTheCallersOwn_notAnotherUsers() throws Exception {
        // A profile exists for this sport, but it belongs to ownerId, not the caller.
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));
        authenticateAs(otherUserId);

        mockMvc.perform(get("/api/sports/profiles/sport/{sportId}", sportId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getForSport_anonymous_is401() throws Exception {
        // A22 added a SecurityConfig matcher for GET /api/sports/profiles/sport/* ahead of the
        // /api/sports/** permitAll ("/profiles/*"'s single "*" does not cover the two-segment path).
        storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));

        mockMvc.perform(get("/api/sports/profiles/sport/{sportId}", sportId).with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    // ---- A21: owner-only gate on GET /api/sports/profiles/{profileId} ----

    @Test
    void getById_owner_is200() throws Exception {
        Long profileId = storedProfile(sportId, true, "Advanced", Map.of("racket", "Li-Ning"));
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(profileId.intValue()))
                .andExpect(jsonPath("$.data.skillLevel").value("Advanced"));
    }

    @Test
    void getById_otherAuthenticatedUser_is403() throws Exception {
        Long profileId = storedProfile(sportId, true, "Advanced", Map.of());
        authenticateAs(otherUserId);

        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You can only view your own sport profile"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void getById_anonymous_is401() throws Exception {
        // A21 widened the SecurityConfig GET matcher to /api/sports/profiles/* ahead of the
        // /api/sports/** permitAll, so an anonymous caller is rejected at the filter chain.
        Long profileId = storedProfile(sportId, true, "Advanced", Map.of());

        mockMvc.perform(get("/api/sports/profiles/{id}", profileId).with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void getById_missing_is404_notLeakingViaOwnershipCheck() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/{id}", 999999))
                .andExpect(status().isNotFound());
    }
}

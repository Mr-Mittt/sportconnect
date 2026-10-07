package com.sportconnect.integration;

import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.location.repository.UserFavoriteLocationRepository;
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

import java.util.HashMap;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LOC-6: the location module's user-reachable error codes through the real pipeline (MockMvc, real
 * Spring wiring, real H2 round-trip, real {@code GlobalExceptionHandler}). Each case asserts the HTTP
 * status, {@code errorCode} and {@code errorParams} beside the English {@code message}. Also covers
 * the two earlier coded 404s whose messages LOC-6 stripped of the id ({@code SPORT_NOT_FOUND} on
 * create, {@code COUNTRY_NOT_FOUND} is covered in {@code ReferenceApiIntegrationTest}).
 *
 * <p>{@link #cacheManager} is cleared per test: {@code SportLookupCache} holds the sport map with no
 * TTL. {@code authenticateAs} only takes effect before a test's first request, so each case runs as
 * one identity.
 */
class LocationErrorCodesIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private UserFavoriteLocationRepository favoriteRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID userId;
    private Long sportId;
    private Long inactiveSportId;
    private Long locationId;

    @BeforeEach
    void setUp() {
        clearAll();
        userId = userRepository.save(User.builder()
                .email("loc6-user@example.com").passwordHash("hash").firstName("Loc6").lastName("User")
                .username("loc6user").isActive(true).build()).getId();
        sportId = sportRepository.save(Sport.builder().name("LOC6 Badminton").isActive(true).build()).getId();
        inactiveSportId = sportRepository.save(Sport.builder().name("LOC6 Curling").isActive(false).build()).getId();
        locationId = locationRepository.save(Location.builder()
                .sportId(sportId).name("LOC6 Court").createdBy(userId).build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDown() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        favoriteRepository.deleteAll();
        locationRepository.deleteAll();
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private void storedProfile() {
        profileRepository.save(UserSportProfile.builder()
                .userId(userId).sportId(sportId).skillLevel("Advanced").bio("bio")
                .yearsOfExperience(4).isActive(true).attributes(new HashMap<>()).build());
    }

    private static String resolveJson(String url) {
        return "{\"url\":\"" + url + "\"}";
    }

    // ---- 404 LOCATION_NOT_FOUND ------------------------------------------------------------

    @Test
    void getLocation_whenUnknown_is404WithNoIdInTheMessage() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(get("/api/locations/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_NOT_FOUND"))
                .andExpect(jsonPath("$.errorParams").doesNotExist())
                .andExpect(jsonPath("$.message").value("Location not found"));
    }

    @Test
    void favorite_whenTheLocationIsUnknown_is404() throws Exception {
        storedProfile();
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/999999/favorite"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_NOT_FOUND"));
    }

    // ---- favorite rules --------------------------------------------------------------------

    @Test
    void favorite_withoutAnActiveProfileForTheSport_is400() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/" + locationId + "/favorite"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_SPORT_PROFILE_REQUIRED"))
                .andExpect(jsonPath("$.errorParams").doesNotExist())
                .andExpect(jsonPath("$.message")
                        .value("You need an active profile for this location's sport to favorite it"));
    }

    @Test
    void favorite_twice_secondIs409() throws Exception {
        storedProfile();
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/" + locationId + "/favorite"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/locations/" + locationId + "/favorite"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_ALREADY_FAVORITED"))
                .andExpect(jsonPath("$.message").value("You have already favorited this location"));
    }

    @Test
    void unfavorite_whenNotFavorited_is409() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(delete("/api/locations/" + locationId + "/favorite"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_NOT_FAVORITED"))
                .andExpect(jsonPath("$.message").value("You have not favorited this location"));
    }

    // ---- create: the sport is reused from A25, now without the id --------------------------

    @Test
    void create_withAnUnknownSport_is404SportNotFoundWithNoIdInTheMessage() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":999999,\"name\":\"Nowhere\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Sport not found"));
    }

    @Test
    void create_withADeactivatedSport_is404SportNotFound() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + inactiveSportId + ",\"name\":\"Frozen\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
    }

    // ---- resolve-maps-url ------------------------------------------------------------------

    @Test
    void resolve_withATextThatIsNotAUrl_is400() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/resolve-maps-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resolveJson("not a url")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_MAPS_URL_INVALID"))
                .andExpect(jsonPath("$.errorParams").doesNotExist())
                .andExpect(jsonPath("$.message").value("Not a valid URL"));
    }

    @Test
    void resolve_withANonGoogleHost_is400WithoutAnyNetworkCall() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/resolve-maps-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resolveJson("https://evil.example.com/maps/@37.42,-122.08,17z")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("LOCATION_MAPS_URL_UNSUPPORTED"))
                .andExpect(jsonPath("$.message").value("Only Google Maps URLs are supported"));
    }

    // ---- deliberately generic --------------------------------------------------------------

    @Test
    void resolve_withABlankUrl_staysTheGenericValidationCode() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations/resolve-maps-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(resolveJson(" ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }

    @Test
    void create_withABlankName_staysTheGenericValidationCode() throws Exception {
        authenticateAs(userId);

        mockMvc.perform(post("/api/locations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }
}

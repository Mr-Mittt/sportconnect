package com.sportconnect.integration;

import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A26: the backend finishes the Keycloak sign-in. Real {@code MockMvc} requests through the real filter chain and
 * services, a real DB round-trip and a real Redis (the re-activation tickets), against {@link TestKeycloak}'s stand-in
 * for the realm's token and end-session endpoints.
 *
 * <p>Covers: first-sign-in provisioning ({@code users.id} = {@code sub}, claims mapped, race between two first
 * sign-ins), an existing user, the deactivation matrix (password: ticket, confirm, expired, replayed, cancelled, session
 * gone; social: automatic re-activation), the failure paths (bad code, phone clash, duplicate email, no identifier,
 * Keycloak down) and that each failure ends the Keycloak session, refresh (rotation, deactivated and unprovisioned
 * users) and logout (cookie driven, idempotent, 503 keeps the cookie).
 *
 * <p>Account lifecycle: a deactivated user never gets a cookie or an access token from {@code /callback} unless they
 * confirm (ticket) or came back through a social provider, and a refresh for one is refused and ends the session.
 */
class KeycloakCallbackIntegrationTest extends RedisBaseIT {

    private static final String VERIFIER = "v".repeat(43);
    private static final String TICKET_KEY_PATTERN = "auth:reactivation-ticket:*";

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private com.sportconnect.reference.repository.CountryRepository countryRepository;
    @Autowired
    private com.sportconnect.reference.repository.RegionRepository regionRepository;
    @Autowired
    private StringRedisTemplate redis;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private DataSource dataSource;

    @BeforeEach
    void setUp() {
        clear();
        ReferenceTestData.reseed(dataSource);
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
    }

    @AfterEach
    void tearDown() {
        TestKeycloak.tokenEndpointAvailable(true);
        clear();
        ReferenceTestData.clear(dataSource);
    }

    private void clear() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
        Set<String> keys = redis.keys(TICKET_KEY_PATTERN);
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    // ---------- helpers ----------

    private ResultActions callback(String code, String verifier) throws Exception {
        return mockMvc.perform(post("/api/auth/callback").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\": \"" + code + "\", \"codeVerifier\": \"" + verifier + "\"}"));
    }

    private ResultActions signIn(TestKeycloak.Identity identity) throws Exception {
        return callback(TestKeycloak.issueCode(identity, VERIFIER), VERIFIER);
    }

    private ResultActions reactivate(String ticket) throws Exception {
        return mockMvc.perform(post("/api/auth/reactivate").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\": \"" + ticket + "\"}"));
    }

    private ResultActions cancel(String ticket) throws Exception {
        return mockMvc.perform(post("/api/auth/reactivate/cancel").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\": \"" + ticket + "\"}"));
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", refreshToken)));
    }

    private ResultActions logout(String refreshToken) throws Exception {
        var request = post("/api/auth/logout").with(anonymous());
        if (refreshToken != null) {
            request.cookie(new Cookie("refreshToken", refreshToken));
        }
        return mockMvc.perform(request);
    }

    /** An existing account with a known id (what an earlier sign-in would have provisioned). */
    private UUID existingUser(boolean active, String email, String phone) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        return userRepository.save(User.builder()
                .email(email)
                .phoneNumber(phone)
                .firstName("Old")
                .lastName("Name")
                .username("old" + System.nanoTime())
                .isActive(active)
                .roles(Set.of(userRole))
                .build()).getId();
    }

    private UUID existingUserWithId(UUID id, boolean active, String email) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        return userRepository.save(User.builder()
                .id(id)
                .email(email)
                .firstName("Old")
                .lastName("Name")
                .username("old" + System.nanoTime())
                .isActive(active)
                .roles(Set.of(userRole))
                .build()).getId();
    }

    private static String ticketOf(MvcResult result) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.errorParams.reactivationTicket");
    }

    private boolean isActive(UUID id) {
        return userRepository.findById(id).orElseThrow().getIsActive();
    }

    // ---------- first sign-in: provisioning ----------

    private Long seededCountryId() {
        return countryRepository.findAll().stream().filter(c -> "VN".equals(c.getIso2())).findFirst().orElseThrow().getId();
    }

    private Long seededRegionId() {
        return regionRepository.findAll().stream().filter(r -> seededCountryId().equals(r.getCountryId())).findFirst().orElseThrow().getId();
    }

    @Test
    void firstSignIn_withTheRegisterPageClaims_storesCountryRegionAndLocation() throws Exception {
        UUID sub = UUID.randomUUID();
        signIn(TestKeycloak.Identity.of(sub).email("geo@example.com").names("Mai", "Nguyen")
                .geo(seededCountryId().toString(), seededRegionId().toString(), "10.7769", "106.7009"))
                .andExpect(status().isOk());

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getCountryId()).isEqualTo(seededCountryId());
        assertThat(user.getRegionId()).isEqualTo(seededRegionId());
        assertThat(user.getLocation().getY()).isEqualTo(10.7769);
        assertThat(user.getLocation().getX()).isEqualTo(106.7009);
    }

    @Test
    void firstSignIn_withBadRegisterPageClaims_stillSignsIn_andDropsOnlyWhatIsInvalid() throws Exception {
        UUID unknownCountry = UUID.randomUUID();
        signIn(TestKeycloak.Identity.of(unknownCountry).email("badcountry@example.com")
                .geo("99999999", seededRegionId().toString(), "10.7769", null))
                .andExpect(status().isOk());
        User dropped = userRepository.findById(unknownCountry).orElseThrow();
        assertThat(dropped.getCountryId()).isNull();
        assertThat(dropped.getRegionId()).isNull();
        assertThat(dropped.getLocation()).isNull();

        UUID badRegion = UUID.randomUUID();
        signIn(TestKeycloak.Identity.of(badRegion).email("badregion@example.com")
                .geo(seededCountryId().toString(), "99999999", "not-a-number", "106.7"))
                .andExpect(status().isOk());
        User kept = userRepository.findById(badRegion).orElseThrow();
        assertThat(kept.getCountryId()).isEqualTo(seededCountryId());
        assertThat(kept.getRegionId()).isNull();
        assertThat(kept.getLocation()).isNull();
    }

    @Test
    void firstSignIn_withoutRegisterPageClaims_leavesTheZoneEmpty() throws Exception {
        UUID sub = UUID.randomUUID();
        signIn(TestKeycloak.Identity.of(sub).email("nogeo@example.com")).andExpect(status().isOk());

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getCountryId()).isNull();
        assertThat(user.getRegionId()).isNull();
        assertThat(user.getLocation()).isNull();
    }

    @Test
    void firstSignIn_provisionsTheUser_withTheSubjectAsId_andOpensASession() throws Exception {
        UUID sub = UUID.randomUUID();
        TestKeycloak.Identity identity = TestKeycloak.Identity.of(sub)
                .email("first@example.com").username("firstuser").names("Mai", "Nguyen")
                .locale("vi").phone("0901234567");

        MvcResult result = signIn(identity)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.data.expiresIn").value(300000))
                .andExpect(jsonPath("$.data.user.id").value(sub.toString()))
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("refreshToken="),
                        org.hamcrest.Matchers.containsString("HttpOnly"),
                        org.hamcrest.Matchers.containsString("Path=/api/auth"),
                        org.hamcrest.Matchers.containsString("SameSite=Strict"),
                        org.hamcrest.Matchers.containsString("Max-Age=86400"))))
                .andReturn();

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getEmail()).isEqualTo("first@example.com");
        assertThat(user.getFirstName()).isEqualTo("Mai");
        assertThat(user.getLastName()).isEqualTo("Nguyen");
        assertThat(user.getUsername()).isEqualTo("firstuser");
        assertThat(user.getPhoneNumber()).isEqualTo("+84901234567");
        assertThat(user.getIsEmailVerified()).isTrue();
        assertThat(user.getIsActive()).isTrue();
        assertThat(user.getPasswordHash()).isNull();
        assertThat(user.getLastLoginAt()).isNotNull();
        assertThat(user.getRoles()).extracting(Role::getName).containsExactly(Role.USER);
        assertThat(userPreferenceRepository.findByUserId(sub)).get().extracting("language").isEqualTo("vi");

        // The token the response carries works on an authenticated endpoint: the row now exists for the A25 gate.
        String accessToken = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(sub.toString()));
    }

    @Test
    void firstSignIn_withOnlyAFullName_splitsItIntoFirstAndLastName() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("name@example.com").fullName("Tran Van Binh")).andExpect(status().isOk());

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getFirstName()).isEqualTo("Tran");
        assertThat(user.getLastName()).isEqualTo("Van Binh");
    }

    @Test
    void firstSignIn_withAnUnverifiedEmail_isStoredUnverified() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("unverified@example.com").emailVerified(false)).andExpect(status().isOk());

        assertThat(userRepository.findById(sub).orElseThrow().getIsEmailVerified()).isFalse();
    }

    @Test
    void firstSignIn_withAPhoneOnly_createsAPhoneOnlyAccount() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).phone("+84912345678").username("zalouser")).andExpect(status().isOk());

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getEmail()).isNull();
        assertThat(user.getPhoneNumber()).isEqualTo("+84912345678");
    }

    @Test
    void firstSignIn_withATakenUsername_getsASuffixedOne() throws Exception {
        existingUserWithId(UUID.randomUUID(), true, "holder@example.com");
        String taken = userRepository.findAll().get(0).getUsername();
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("clash@example.com").username(taken)).andExpect(status().isOk());

        assertThat(userRepository.findById(sub).orElseThrow().getUsername())
                .startsWith(taken).endsWith("-" + sub.toString().substring(0, 6));
    }

    @Test
    void firstSignIn_withAnUnknownLanguage_stillSucceeds_withoutAPreference() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("lang@example.com").locale("zz")).andExpect(status().isOk());

        assertThat(userPreferenceRepository.findByUserId(sub)).isEmpty();
    }

    @Test
    void twoFirstSignInsForOneSubject_createOneUser_andBothSucceed() throws Exception {
        UUID sub = UUID.randomUUID();
        TestKeycloak.Identity identity = TestKeycloak.Identity.of(sub).email("race@example.com").username("raceuser");
        String codeA = TestKeycloak.issueCode(identity, VERIFIER);
        String codeB = TestKeycloak.issueCode(identity, VERIFIER);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (String code : List.of(codeA, codeB)) {
                Callable<Integer> task = () -> {
                    go.await();
                    return callback(code, VERIFIER).andReturn().getResponse().getStatus();
                };
                results.add(pool.submit(task));
            }
            go.countDown();
            for (Future<Integer> result : results) {
                assertThat(result.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(userRepository.findAll().stream().filter(u -> u.getId().equals(sub))).hasSize(1);
    }

    // ---------- existing user ----------

    @Test
    void anExistingUser_signsIn_withoutTheirProfileBeingOverwritten() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), true, "kept@example.com");

        signIn(TestKeycloak.Identity.of(sub).email("changed@example.com").names("New", "Person"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.email").value("kept@example.com"));

        User user = userRepository.findById(sub).orElseThrow();
        assertThat(user.getEmail()).isEqualTo("kept@example.com");
        assertThat(user.getFirstName()).isEqualTo("Old");
        assertThat(user.getLastLoginAt()).isNotNull();
    }

    // ---------- deactivated: password -> ticket ----------

    @Test
    void deactivatedPasswordUser_getsATicket_noCookie_noToken_andStaysDeactivated() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "gone@example.com");

        signIn(TestKeycloak.Identity.of(sub).email("gone@example.com"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"))
                .andExpect(jsonPath("$.errorParams.reactivationTicket").isNotEmpty())
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(isActive(sub)).isFalse();
        // The Keycloak session is parked, not ended: the ticket still has a session to release.
        assertThat(TestKeycloak.sessionAlive(TestKeycloak.latestRefreshToken(sub))).isTrue();
    }

    @Test
    void confirmingTheTicket_reactivates_andOpensTheSession() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "back@example.com");
        String ticket = ticketOf(signIn(TestKeycloak.Identity.of(sub).email("back@example.com")).andReturn());

        MvcResult result = reactivate(ticket)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.user.id").value(sub.toString()))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("refreshToken=")))
                .andReturn();

        assertThat(isActive(sub)).isTrue();
        String accessToken = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken)).andExpect(status().isOk());
    }

    @Test
    void aTicket_worksOnce() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "once@example.com");
        String ticket = ticketOf(signIn(TestKeycloak.Identity.of(sub).email("once@example.com")).andReturn());

        reactivate(ticket).andExpect(status().isOk());
        reactivate(ticket).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REACTIVATION_TICKET_INVALID"));
    }

    @Test
    void anExpiredTicket_isRefused_andTheAccountStaysDeactivated() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "late@example.com");
        String ticket = ticketOf(signIn(TestKeycloak.Identity.of(sub).email("late@example.com")).andReturn());
        // What the 5 minute TTL does.
        redis.delete(redis.keys(TICKET_KEY_PATTERN));

        reactivate(ticket).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REACTIVATION_TICKET_INVALID"));

        assertThat(isActive(sub)).isFalse();
    }

    @Test
    void aTicketLivesFiveMinutes() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "ttl@example.com");
        signIn(TestKeycloak.Identity.of(sub).email("ttl@example.com")).andExpect(status().isUnauthorized());

        Set<String> keys = redis.keys(TICKET_KEY_PATTERN);
        assertThat(keys).hasSize(1);
        Long ttl = redis.getExpire(keys.iterator().next());
        assertThat(ttl).isBetween(250L, 300L);
    }

    @Test
    void anUnknownTicket_isRefused() throws Exception {
        reactivate("not-a-ticket").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REACTIVATION_TICKET_INVALID"));
    }

    @Test
    void confirmingAfterTheParkedSessionEnded_isRefused_andTheAccountStaysDeactivated() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "idle@example.com");
        String ticket = ticketOf(signIn(TestKeycloak.Identity.of(sub).email("idle@example.com")).andReturn());
        TestKeycloak.expireSession(TestKeycloak.latestRefreshToken(sub));

        reactivate(ticket).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REACTIVATION_TICKET_INVALID"));

        assertThat(isActive(sub)).isFalse();
    }

    @Test
    void cancelling_dropsTheTicket_endsTheKeycloakSession_andLeavesTheAccountDeactivated() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "no@example.com");
        String ticket = ticketOf(signIn(TestKeycloak.Identity.of(sub).email("no@example.com")).andReturn());
        String parked = TestKeycloak.latestRefreshToken(sub);

        cancel(ticket).andExpect(status().isOk());

        assertThat(TestKeycloak.sessionEnded(parked)).isTrue();
        assertThat(isActive(sub)).isFalse();
        reactivate(ticket).andExpect(status().isUnauthorized());
    }

    @Test
    void cancelling_anUnknownTicket_isStill200() throws Exception {
        cancel("never-issued").andExpect(status().isOk());
    }

    // ---------- deactivated: social -> automatic ----------

    @Test
    void deactivatedSocialUser_isReactivatedAutomatically_andOpensASession() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "social@example.com");

        signIn(TestKeycloak.Identity.of(sub).email("social@example.com").viaProvider("google"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("refreshToken=")));

        assertThat(isActive(sub)).isTrue();
    }

    @Test
    void reactivationByASocialSignIn_isVisibleToTheGateAtOnce() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "gate@example.com");
        // The 401 caches "inactive"; the reactivation must evict it rather than wait for the TTL.
        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(sub))).andExpect(status().isUnauthorized());

        signIn(TestKeycloak.Identity.of(sub).email("gate@example.com").viaProvider("facebook")).andExpect(status().isOk());

        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(sub))).andExpect(status().isOk());
    }

    // ---------- failures ----------

    @Test
    void anUnknownCode_isAuthCodeInvalid() throws Exception {
        callback("code-nobody-issued", VERIFIER).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_CODE_INVALID"));
    }

    @Test
    void aWrongVerifier_isAuthCodeInvalid() throws Exception {
        String code = TestKeycloak.issueCode(TestKeycloak.Identity.of(UUID.randomUUID()).email("v@example.com"), VERIFIER);

        callback(code, "w".repeat(43)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_CODE_INVALID"));
    }

    @Test
    void aReplayedCode_isAuthCodeInvalid() throws Exception {
        String code = TestKeycloak.issueCode(TestKeycloak.Identity.of(UUID.randomUUID()).email("replay@example.com"), VERIFIER);

        callback(code, VERIFIER).andExpect(status().isOk());
        callback(code, VERIFIER).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTH_CODE_INVALID"));
    }

    @Test
    void aMissingVerifier_isRejectedByValidation() throws Exception {
        mockMvc.perform(post("/api/auth/callback").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\": \"abc\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aPhoneAnotherAccountHolds_is409_createsNoUser_andEndsTheKeycloakSession() throws Exception {
        existingUser(true, "holder@example.com", "+84901234567");
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("newcomer@example.com").phone("0901234567"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PHONE_ALREADY_USED"))
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(userRepository.findById(sub)).isEmpty();
        assertThat(TestKeycloak.sessionEnded(TestKeycloak.latestRefreshToken(sub))).isTrue();
    }

    @Test
    void anEmailAnotherAccountHolds_is409_createsNoUser_andEndsTheKeycloakSession() throws Exception {
        existingUser(true, "taken@example.com", null);
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("taken@example.com"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));

        assertThat(userRepository.findById(sub)).isEmpty();
        assertThat(TestKeycloak.sessionEnded(TestKeycloak.latestRefreshToken(sub))).isTrue();
    }

    @Test
    void anIdentityWithNeitherEmailNorPhone_is400_createsNoUser_andEndsTheKeycloakSession() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).username("nobody"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("IDENTIFIER_REQUIRED"));

        assertThat(userRepository.findById(sub)).isEmpty();
        assertThat(TestKeycloak.sessionEnded(TestKeycloak.latestRefreshToken(sub))).isTrue();
    }

    @Test
    void anInvalidPhone_is400_andEndsTheKeycloakSession() throws Exception {
        UUID sub = UUID.randomUUID();

        signIn(TestKeycloak.Identity.of(sub).email("badphone@example.com").phone("12"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_PHONE_NUMBER"));

        assertThat(userRepository.findById(sub)).isEmpty();
        assertThat(TestKeycloak.sessionEnded(TestKeycloak.latestRefreshToken(sub))).isTrue();
    }

    @Test
    void whenKeycloakIsDown_callbackAnswers503() throws Exception {
        String code = TestKeycloak.issueCode(TestKeycloak.Identity.of(UUID.randomUUID()).email("down@example.com"), VERIFIER);
        TestKeycloak.tokenEndpointAvailable(false);

        callback(code, VERIFIER).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("SERVICE_UNAVAILABLE"));
    }

    // ---------- refresh ----------

    @Test
    void refresh_setsTheNewCookie_andReturnsAFreshAccessToken() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), true, "refresh@example.com");
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("refresh@example.com"));

        MvcResult result = refresh(cookie)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.user.id").value(sub.toString()))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("refreshToken=")))
                .andReturn();

        String rotated = result.getResponse().getCookie("refreshToken").getValue();
        assertThat(rotated).isNotEqualTo(cookie);
        refresh(rotated).andExpect(status().isOk());
    }

    @Test
    void refresh_ofADeactivatedUser_is401_andEndsTheSession() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), false, "off@example.com");
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("off@example.com"));

        refresh(cookie).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"))
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(TestKeycloak.sessionEnded(cookie)).isTrue();
    }

    @Test
    void refresh_ofAnUnprovisionedSubject_is401_andEndsTheSession() throws Exception {
        UUID sub = UUID.randomUUID();
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("ghost@example.com"));

        refresh(cookie).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"));

        assertThat(TestKeycloak.sessionEnded(cookie)).isTrue();
    }

    @Test
    void refresh_withATokenKeycloakDoesNotKnow_is401() throws Exception {
        refresh("refresh-never-issued").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"));
    }

    @Test
    void refresh_whenKeycloakIsDown_is503_notA401() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), true, "down2@example.com");
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("down2@example.com"));
        TestKeycloak.tokenEndpointAvailable(false);

        // A 401 here would make the client log the user out for an outage that is not theirs.
        refresh(cookie).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("SERVICE_UNAVAILABLE"));
    }

    // ---------- logout ----------

    @Test
    void logout_endsTheKeycloakSession_andClearsTheCookie_withoutABearerToken() throws Exception {
        UUID sub = existingUserWithId(UUID.randomUUID(), true, "bye@example.com");
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("bye@example.com"));

        logout(cookie).andExpect(status().isOk())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));

        assertThat(TestKeycloak.sessionEnded(cookie)).isTrue();
        refresh(cookie).andExpect(status().isUnauthorized());
    }

    @Test
    void logout_withoutACookie_is200() throws Exception {
        logout(null).andExpect(status().isOk());
    }

    @Test
    void logout_ofASessionKeycloakAlreadyDropped_is200() throws Exception {
        UUID sub = UUID.randomUUID();
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("dead@example.com"));
        TestKeycloak.expireSession(cookie);

        logout(cookie).andExpect(status().isOk())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
    }

    @Test
    void logout_whenKeycloakIsDown_is503_andKeepsTheCookie() throws Exception {
        UUID sub = UUID.randomUUID();
        String cookie = TestKeycloak.startSession(TestKeycloak.Identity.of(sub).email("stuck@example.com"));
        TestKeycloak.tokenEndpointAvailable(false);

        logout(cookie).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("SERVICE_UNAVAILABLE"))
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(TestKeycloak.sessionAlive(cookie)).isTrue();
    }
}

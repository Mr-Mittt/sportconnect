package com.sportconnect.integration;

import com.sportconnect.user.api.dto.FriendRequestStatus;
import com.sportconnect.user.entity.FriendRequest;
import com.sportconnect.user.entity.Friendship;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.FriendRequestRepository;
import com.sportconnect.user.repository.FriendshipRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U21 - the user module's error codes reaching the real response body: status plus {@code errorCode} and
 * {@code errorParams}, through the real security chain, controllers, services, H2 and
 * {@code GlobalExceptionHandler}. Covers the ownership boundary (403), the not-found boundaries (404), the
 * friend-state conflicts that moved 400 to 409, the range/validation errors, a deactivated caller, and the
 * shoe-size millimetre round trip. A mocked Spock spec proves a service throws the code; only this proves the
 * code and status survive the pipeline.
 *
 * <p>One identity per test method: {@link #authenticateAs} does not switch identity after the first request.
 */
class UserErrorCodesIntegrationTest extends BaseIT {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private FriendRequestRepository friendRequestRepository;
    @Autowired
    private FriendshipRepository friendshipRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private UUID me;
    private UUID other;

    @BeforeEach
    void setUp() {
        clear();
        me = saveUser("u21-me", true);
        other = saveUser("u21-other", true);
    }

    @AfterEach
    void tearDown() {
        clear();
    }

    private void clear() {
        friendRequestRepository.deleteAll();
        friendshipRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID saveUser(String label, boolean active) {
        return userRepository.save(User.builder()
                .email(label + "@example.com").passwordHash(passwordEncoder.encode("correct-password"))
                .firstName("U21").lastName(label).username(label)
                .isActive(active).build()).getId();
    }

    private ResultActions updateProfile(UUID target, String json) throws Exception {
        return mockMvc.perform(put("/api/users/{id}/profile", target).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions sendRequest(UUID receiver) throws Exception {
        return mockMvc.perform(post("/api/users/friends/requests").contentType(MediaType.APPLICATION_JSON)
                .content("{\"receiverId\": \"" + receiver + "\"}"));
    }

    private UUID saveRequest(UUID sender, UUID receiver, FriendRequestStatus status) {
        return friendRequestRepository.save(FriendRequest.builder()
                .senderId(sender).receiverId(receiver).status(status).build()).getId();
    }

    // ---------- profile: ownership and ranges ----------

    @Test
    void updateProfile_ofSomeoneElse_is403WithOwnershipCode() throws Exception {
        authenticateAs(me);

        updateProfile(other, "{\"bio\": \"x\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("USER_PROFILE_NOT_OWNED"));

        assertThat(userRepository.findById(other).orElseThrow().getBio()).isNull();
    }

    @Test
    void updateProfile_heightOutOfRange_is400WithMinMax() throws Exception {
        authenticateAs(me);

        updateProfile(me, "{\"heightCm\": 49}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("HEIGHT_OUT_OF_RANGE"))
                .andExpect(jsonPath("$.errorParams.min").value(50))
                .andExpect(jsonPath("$.errorParams.max").value(300));
    }

    @Test
    void updateProfile_weightOutOfRange_is400WithMinMax() throws Exception {
        authenticateAs(me);

        updateProfile(me, "{\"weightKg\": 19}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("WEIGHT_OUT_OF_RANGE"))
                .andExpect(jsonPath("$.errorParams.min").value(20))
                .andExpect(jsonPath("$.errorParams.max").value(300));
    }

    @Test
    void updateProfile_shoeSizeOutOfRange_is400WithMillimetreBounds() throws Exception {
        authenticateAs(me);

        updateProfile(me, "{\"shoeSizeMm\": 501}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SHOE_SIZE_OUT_OF_RANGE"))
                .andExpect(jsonPath("$.errorParams.min").value(10))
                .andExpect(jsonPath("$.errorParams.max").value(500))
                .andExpect(jsonPath("$.message").value("shoeSizeMm must be between 10 and 500"));

        assertThat(jdbc.queryForObject("SELECT shoe_size_mm FROM users WHERE id = ?", Integer.class, me)).isNull();
    }

    @Test
    void updateProfile_shoeSizeInMillimetres_isStoredAndReturned() throws Exception {
        authenticateAs(me);

        updateProfile(me, "{\"shoeSizeMm\": 265}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shoeSizeMm").value(265));

        assertThat(jdbc.queryForObject("SELECT shoe_size_mm FROM users WHERE id = ?", Integer.class, me)).isEqualTo(265);

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shoeSizeMm").value(265));
    }

    @Test
    void updateProfile_invalidGender_is400WithAllowedValues() throws Exception {
        authenticateAs(me);

        updateProfile(me, "{\"gender\": \"OTHER\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GENDER_INVALID"))
                .andExpect(jsonPath("$.errorParams.allowed[0]").value("MALE"))
                .andExpect(jsonPath("$.errorParams.allowed[1]").value("FEMALE"));
    }

    // ---------- language, password, search ----------

    @Test
    void updatePreferences_unknownLanguage_is400WithTheLanguage() throws Exception {
        authenticateAs(me);

        mockMvc.perform(put("/api/users/me/preferences").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"language\": \"zz\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("LANGUAGE_UNKNOWN"))
                .andExpect(jsonPath("$.errorParams.language").value("zz"));
    }

    @Test
    void changePassword_wrongCurrentPassword_is400WithCode() throws Exception {
        authenticateAs(me);

        mockMvc.perform(put("/api/users/me/password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\": \"nope\", \"newPassword\": \"new-password-1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));
    }

    @Test
    void search_shortKeyword_is400WithMin() throws Exception {
        authenticateAs(me);

        mockMvc.perform(get("/api/users/search").param("q", "a"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SEARCH_KEYWORD_TOO_SHORT"))
                .andExpect(jsonPath("$.errorParams.min").value(2));
    }

    // ---------- friends ----------

    @Test
    void sendRequest_toSelf_is400WithCode() throws Exception {
        authenticateAs(me);

        sendRequest(me)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_SELF"));
    }

    @Test
    void sendRequest_toUnknownOrDeactivatedReceiver_is404WithUserNotFound() throws Exception {
        UUID deactivated = saveUser("u21-gone", false);
        authenticateAs(me);

        sendRequest(deactivated)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("USER_NOT_FOUND"));
    }

    @Test
    void sendRequest_toAFriend_is409AlreadyFriends() throws Exception {
        friendshipRepository.save(Friendship.builder().userId(me).friendId(other).build());
        friendshipRepository.save(Friendship.builder().userId(other).friendId(me).build());
        authenticateAs(me);

        sendRequest(other)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("ALREADY_FRIENDS"));
    }

    @Test
    void sendRequest_whileOneIsPending_is409AlreadyPending() throws Exception {
        saveRequest(me, other, FriendRequestStatus.PENDING);
        authenticateAs(me);

        sendRequest(other)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_ALREADY_PENDING"));
    }

    @Test
    void acceptRequest_noLongerPending_is409() throws Exception {
        UUID requestId = saveRequest(other, me, FriendRequestStatus.CANCELLED);
        authenticateAs(me);

        mockMvc.perform(put("/api/users/friends/requests/{id}/accept", requestId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_NOT_PENDING"));
    }

    @Test
    void declineRequest_noLongerPending_is409() throws Exception {
        UUID requestId = saveRequest(other, me, FriendRequestStatus.DECLINED);
        authenticateAs(me);

        mockMvc.perform(put("/api/users/friends/requests/{id}/decline", requestId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_NOT_PENDING"));
    }

    @Test
    void cancelRequest_noLongerPending_is409() throws Exception {
        UUID requestId = saveRequest(me, other, FriendRequestStatus.DECLINED);
        authenticateAs(me);

        mockMvc.perform(delete("/api/users/friends/requests/{id}", requestId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_NOT_PENDING"));
    }

    @Test
    void acceptRequest_addressedToSomeoneElse_is404WithRequestNotFound() throws Exception {
        UUID requestId = saveRequest(me, other, FriendRequestStatus.PENDING);
        authenticateAs(me);

        // The receiver is `other`; `me` is the sender, so the receiver-scoped lookup finds nothing.
        mockMvc.perform(put("/api/users/friends/requests/{id}/accept", requestId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("FRIEND_REQUEST_NOT_FOUND"));
    }

    @Test
    void removeFriend_whoIsNotAFriend_is409NotFriends() throws Exception {
        authenticateAs(me);

        mockMvc.perform(delete("/api/users/friends/{id}", other))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("NOT_FRIENDS"));
    }

    // ---------- a deactivated caller (CLAUDE.md, Account lifecycle) ----------

    @Test
    void deactivatedCaller_updatingOwnProfile_is404AndUncoded() throws Exception {
        jdbc.update("UPDATE users SET is_active = FALSE WHERE id = ?", me);
        authenticateAs(me);

        updateProfile(me, "{\"bio\": \"x\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").doesNotExist());
    }

    @Test
    void deactivatedCaller_changingPassword_is404AndUncoded() throws Exception {
        jdbc.update("UPDATE users SET is_active = FALSE WHERE id = ?", me);
        authenticateAs(me);

        mockMvc.perform(put("/api/users/me/password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\": \"correct-password\", \"newPassword\": \"new-password-1\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").doesNotExist());
    }

    @Test
    void deactivatedCaller_readingPreferences_is404AndUncoded() throws Exception {
        jdbc.update("UPDATE users SET is_active = FALSE WHERE id = ?", me);
        authenticateAs(me);

        mockMvc.perform(get("/api/users/me/preferences"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").doesNotExist());
    }
}

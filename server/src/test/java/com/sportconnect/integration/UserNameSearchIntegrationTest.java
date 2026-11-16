package com.sportconnect.integration;

import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GL-64 — {@code GET /api/users/search} (the global "find a person" search) now follows the app's one name rule:
 * first and last name only, word-start, accent- and case-insensitive, every typed word must match. Runs the real
 * controller, {@code UserServiceImpl} and native query on H2 (whose {@code immutable_unaccent} alias stands in for
 * Postgres's); the real function and the trigram indexes are checked by {@code UserNameSearchPostgresTest}.
 */
class UserNameSearchIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    private UUID callerId;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        callerId = save("Caller", "Person", "caller_handle", true).getId();
    }

    @AfterEach
    void tearDown() {
        userRepository.deleteAll();
    }

    private User save(String firstName, String lastName, String username, boolean active) {
        return userRepository.save(User.builder()
                .email("s-" + UUID.randomUUID() + "@example.com")
                .firstName(firstName).lastName(lastName).username(username)
                .isActive(active).build());
    }

    private ResultActions search(String q) throws Exception {
        return mockMvc.perform(get("/api/users/search").param("q", q).header("Authorization", bearerFor(callerId, "USER")))
                .andExpect(status().isOk());
    }

    @Test
    void accentsAndCaseAreIgnored_includingTheVietnameseD() throws Exception {
        save("Tuấn", "Nguyễn", "h1", true);
        save("Minh", "Đặng", "h2", true);

        search("tuan").andExpect(jsonPath("$.data.content", hasSize(1)))
                .andExpect(jsonPath("$.data.content[0].fullName").value("Tuấn Nguyễn"));
        search("NGUYEN").andExpect(jsonPath("$.data.content", hasSize(1)));
        search("dang").andExpect(jsonPath("$.data.content", hasSize(1)))
                .andExpect(jsonPath("$.data.content[0].fullName").value("Minh Đặng"));
    }

    @Test
    void aWordMustStartAName_notBeInsideOne() throws Exception {
        save("Bao", "Tran", "h3", true);
        save("Binh", "An", "h4", true);

        search("an").andExpect(jsonPath("$.data.content", hasSize(1)))
                .andExpect(jsonPath("$.data.content[0].fullName").value("Binh An"));
        search("ran").andExpect(jsonPath("$.data.content", hasSize(0)));
    }

    @Test
    void theUsernameIsNoLongerSearched() throws Exception {
        save("Plain", "Name", "zzuniquehandle", true);

        search("zzuniquehandle").andExpect(jsonPath("$.data.content", hasSize(0)));
        search("plain").andExpect(jsonPath("$.data.content", hasSize(1)))
                .andExpect(jsonPath("$.data.content[0].username").value("zzuniquehandle"));
    }

    @Test
    void everyTypedWordMustMatch_inAnyOrder_andALaterWordOfAFieldCounts() throws Exception {
        save("Tuấn Anh", "Nguyễn", "h5", true);

        search("anh tu").andExpect(jsonPath("$.data.content", hasSize(1)));
        search("nguyen anh").andExpect(jsonPath("$.data.content", hasSize(1)));
        search("anh zzz").andExpect(jsonPath("$.data.content", hasSize(0)));
    }

    @Test
    void theCallerAndDeactivatedUsersAreNeverReturned() throws Exception {
        save("Caller", "Twin", "h6", false);

        search("caller").andExpect(jsonPath("$.data.content", hasSize(0)));
    }

    @Test
    void aWildcardTypedByTheUserIsLiteral() throws Exception {
        save("Plain", "Name", "h7", true);

        search("%%").andExpect(jsonPath("$.data.content", hasSize(0)));
        search("p_").andExpect(jsonPath("$.data.content", hasSize(0)));
    }
}

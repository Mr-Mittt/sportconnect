package com.sportconnect.integration;

import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U20 - {@code gender} as a closed set ({@code MALE} / {@code FEMALE}), through the real request pipeline: real
 * {@code SecurityConfig}, {@code UserController}, {@code UserServiceImpl}, a real H2 round trip, and
 * {@code GlobalExceptionHandler}'s exception-to-400 mapping (a mocked service spec cannot prove any of those).
 *
 * <p>Also runs the <strong>real</strong> {@code V076__normalize_user_gender.sql} against legacy rows. The H2
 * {@code schema.sql} mirror already carries {@code chk_users_gender}, so the migration test drops it first, inserts
 * the legacy free-text rows, runs the real file (which normalises them and re-adds the constraint) and asserts both.
 * That the same SQL applies on real Postgres is checked separately by running it against the dev database.
 */
class ProfileGenderIntegrationTest extends BaseIT {

    private static final String MIGRATION = "db/changelog/changes/V076__normalize_user_gender.sql";

    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;

    private UUID userId;

    @BeforeEach
    void setUp() {
        clearUsers();
        userId = saveUser("u20-owner", null);
    }

    @AfterEach
    void tearDown() {
        // The migration test removes the constraint; put it back whatever happened, then clean up.
        jdbc.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_gender");
        jdbc.execute("UPDATE users SET gender = NULL");
        jdbc.execute("ALTER TABLE users ADD CONSTRAINT chk_users_gender CHECK (gender IN ('MALE', 'FEMALE'))");
        clearUsers();
    }

    private void clearUsers() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID saveUser(String label, String gender) {
        return userRepository.save(User.builder()
                .email(label + "@example.com").passwordHash("hash")
                .firstName("Gen").lastName(label).username(label)
                .gender(gender).isActive(true).build()).getId();
    }

    private ResultActions updateProfile(String json) throws Exception {
        return mockMvc.perform(put("/api/users/{id}/profile", userId).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String storedGender(UUID id) {
        return jdbc.queryForObject("SELECT gender FROM users WHERE id = ?", String.class, id);
    }

    // ---------- the API ----------

    @Test
    void updateProfile_validGender_isStoredAndReturnedAsAString() throws Exception {
        authenticateAs(userId);

        updateProfile("{\"gender\": \"FEMALE\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.gender").value("FEMALE"));

        assertThat(storedGender(userId)).isEqualTo("FEMALE");

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.gender").value("FEMALE"));
    }

    @Test
    void updateProfile_outsideTheSet_isBadRequestWithAClearMessageAndLeavesTheProfileUntouched() throws Exception {
        authenticateAs(userId);

        updateProfile("{\"gender\": \"OTHER\", \"bio\": \"must not be saved\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("gender must be one of: MALE, FEMALE"));

        assertThat(storedGender(userId)).isNull();
        assertThat(userRepository.findById(userId).orElseThrow().getBio())
                .as("no other field is applied when the gender is invalid").isNull();
    }

    @Test
    void updateProfile_lowercase_isRejected() throws Exception {
        authenticateAs(userId);

        updateProfile("{\"gender\": \"male\"}").andExpect(status().isBadRequest());

        assertThat(storedGender(userId)).isNull();
    }

    @Test
    void updateProfile_emptyStringClearsAndNullSkips() throws Exception {
        jdbc.update("UPDATE users SET gender = 'MALE' WHERE id = ?", userId);
        authenticateAs(userId);

        updateProfile("{\"bio\": \"gender omitted\"}").andExpect(status().isOk());
        assertThat(storedGender(userId)).as("absent gender is skipped").isEqualTo("MALE");

        updateProfile("{\"gender\": null, \"bio\": \"explicit null\"}").andExpect(status().isOk());
        assertThat(storedGender(userId)).as("null gender is skipped").isEqualTo("MALE");

        updateProfile("{\"gender\": \"\"}").andExpect(status().isOk());
        assertThat(storedGender(userId)).as("empty string clears, stored as NULL not an empty string").isNull();
    }

    // ---------- the database ----------

    @Test
    void checkConstraint_rejectsAFreeTextValueWrittenBehindTheServicesBack() {
        assertThatThrownBy(() -> jdbc.update("UPDATE users SET gender = 'asdf' WHERE id = ?", userId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void migration_normalisesLegacyRowsAndReinstatesTheConstraint() {
        jdbc.execute("ALTER TABLE users DROP CONSTRAINT chk_users_gender");
        UUID female = saveUser("legacy-female", "Female");
        UUID shortFemale = saveUser("legacy-f", "f");
        UUID male = saveUser("legacy-male", " male ");
        UUID shortMale = saveUser("legacy-m", "M");
        UUID junk = saveUser("legacy-junk", "asdf");
        UUID empty = saveUser("legacy-empty", "");
        UUID canonical = saveUser("legacy-canonical", "MALE");
        UUID unset = saveUser("legacy-unset", null);

        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(new ClassPathResource(MIGRATION));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);

        assertThat(storedGender(female)).isEqualTo("FEMALE");
        assertThat(storedGender(shortFemale)).isEqualTo("FEMALE");
        assertThat(storedGender(male)).isEqualTo("MALE");
        assertThat(storedGender(shortMale)).isEqualTo("MALE");
        assertThat(storedGender(junk)).as("unmappable free text becomes NULL").isNull();
        assertThat(storedGender(empty)).as("empty string becomes NULL").isNull();
        assertThat(storedGender(canonical)).isEqualTo("MALE");
        assertThat(storedGender(unset)).isNull();

        assertThatThrownBy(() -> jdbc.update("UPDATE users SET gender = 'asdf' WHERE id = ?", userId))
                .as("the migration re-adds the CHECK constraint")
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}

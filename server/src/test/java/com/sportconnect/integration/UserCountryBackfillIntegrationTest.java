package com.sportconnect.integration;

import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * U16 — the one-time {@code users.country -> users.country_id} backfill in {@code V075}, run against the real
 * reference seed on H2.
 *
 * <p>H2 cannot run all of {@code V075}: the {@code ALTER TABLE ... ADD COLUMN} statements would clash with the columns
 * the {@code schema.sql} mirror already carries (that mirror is what the JPA entities are tested against). So this
 * reads the <strong>real migration file</strong>, cuts it at its {@code UPDATE users} statement and executes exactly
 * that — the matching rules under test are the shipped SQL, not a copy. That the whole file also applies on real
 * Postgres is checked separately, by starting the app against the dev database.
 */
class UserCountryBackfillIntegrationTest extends BaseIT {

    private static final String MIGRATION = "db/changelog/changes/V075__add_country_region_links_to_users.sql";

    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;

    private Long vietnamId;

    @BeforeEach
    void setUp() {
        clearUsers();
        ReferenceTestData.reseed(dataSource);
        vietnamId = jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'VN'", Long.class);
    }

    @AfterEach
    void tearDown() {
        clearUsers();
        ReferenceTestData.clear(dataSource);
    }

    private void clearUsers() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    /** The migration's {@code UPDATE users ...;} statement, taken verbatim from the shipped file. */
    private String backfillSql() throws Exception {
        String sql = new String(new ClassPathResource(MIGRATION).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int start = sql.indexOf("UPDATE users");
        assertThat(start).as("V075 must contain the backfill UPDATE").isGreaterThanOrEqualTo(0);
        int end = sql.indexOf(';', start);
        return sql.substring(start, end + 1);
    }

    private UUID saveUserWithLegacyCountry(String label, String legacyCountry, Long alreadyLinkedTo) {
        return userRepository.save(User.builder()
                .email(label + "@example.com").passwordHash("hash").firstName("B").lastName(label)
                .country(legacyCountry).countryId(alreadyLinkedTo).isActive(true).build()).getId();
    }

    private Long countryIdOf(UUID id) {
        return userRepository.findById(id).orElseThrow().getCountryId();
    }

    @Test
    void backfill_matchesNameIso2AndIso3_ignoringCaseAndSpaces() throws Exception {
        UUID byName = saveUserWithLegacyCountry("byname", "Vietnam", null);
        UUID lowerName = saveUserWithLegacyCountry("lowername", "vietnam", null);
        UUID spacedName = saveUserWithLegacyCountry("spaced", "Viet Nam", null);
        UUID shouting = saveUserWithLegacyCountry("shouting", "VIET NAM", null);
        UUID iso2 = saveUserWithLegacyCountry("iso2", "vn", null);
        UUID iso3 = saveUserWithLegacyCountry("iso3", "VNM", null);
        UUID padded = saveUserWithLegacyCountry("padded", "  VN  ", null);

        jdbc.execute(backfillSql());

        for (UUID id : new UUID[]{byName, lowerName, spacedName, shouting, iso2, iso3, padded}) {
            assertThat(countryIdOf(id)).as("user %s", id).isEqualTo(vietnamId);
        }
    }

    @Test
    void backfill_leavesUnmatchedBlankAndNullTextAlone_andNeverBackfillsTheRegion() throws Exception {
        UUID atlantis = saveUserWithLegacyCountry("atlantis", "Atlantis", null);
        UUID blank = saveUserWithLegacyCountry("blank", "   ", null);
        UUID none = saveUserWithLegacyCountry("none", null, null);

        jdbc.execute(backfillSql());

        assertThat(countryIdOf(atlantis)).isNull();
        assertThat(countryIdOf(blank)).isNull();
        assertThat(countryIdOf(none)).isNull();
        assertThat(userRepository.findById(atlantis).orElseThrow().getCountry()).as("legacy text is kept").isEqualTo("Atlantis");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE region_id IS NOT NULL", Long.class)).isZero();
    }

    @Test
    void backfill_neverOverwritesAnExistingLink_andIsSafeToRunAgain() throws Exception {
        UUID alreadyLinked = saveUserWithLegacyCountry("linked", "Vietnam", 424242L);
        UUID pending = saveUserWithLegacyCountry("pending", "Vietnam", null);

        jdbc.execute(backfillSql());
        jdbc.execute(backfillSql());     // REF-4 will run it again once more countries are seeded

        assertThat(countryIdOf(alreadyLinked)).as("an existing link is not touched").isEqualTo(424242L);
        assertThat(countryIdOf(pending)).isEqualTo(vietnamId);
    }

    /** Only Vietnam is seeded today: text naming a country that has no row yet stays unlinked until REF-4 re-runs this. */
    @Test
    void backfill_textNamingAnUnseededCountry_staysUnlinkedUntilItIsSeeded() throws Exception {
        UUID france = saveUserWithLegacyCountry("france", "France", null);

        jdbc.execute(backfillSql());
        assertThat(countryIdOf(france)).isNull();

        jdbc.update("INSERT INTO countries (iso2, iso3, name, is_active) VALUES ('FR', 'FRA', 'France', TRUE)");
        jdbc.execute(backfillSql());
        assertThat(countryIdOf(france)).isEqualTo(
                jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'FR'", Long.class));
    }
}

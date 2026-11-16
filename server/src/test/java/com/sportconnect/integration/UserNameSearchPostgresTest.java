package com.sportconnect.integration;

import com.sportconnect.user.repository.UserNameSearch;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SESSION-GL-64 — the one test that runs the name search against a REAL Postgres (the project's dev image, postgis 16),
 * because the H2 integration tests can only stand in for {@code immutable_unaccent()}. It runs the real migration
 * {@code V090} and then proves three things H2 cannot: Postgres's own {@code unaccent} rules fold Vietnamese the way the
 * rule needs (including {@code đ}); the exact SQL {@link UserNameSearch} builds returns the right rows on Postgres (the
 * {@code ESCAPE} clause, the word-start branch); and the trigram indexes really serve both the field-start and the
 * later-word branches (the plan is read with sequential scans disabled, so it shows what the index CAN do).
 * Needs Docker, like the other container-based tests in this folder.
 */
class UserNameSearchPostgresTest {

    private static final GenericContainer<?> POSTGRES =
            new GenericContainer<>(DockerImageName.parse("postgis/postgis:16-3.6"))
                    .withEnv("POSTGRES_PASSWORD", "test")
                    .withEnv("POSTGRES_DB", "namesearch")
                    .withExposedPorts(5432)
                    .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*\\s", 2));

    private static Connection connection;

    @BeforeAll
    static void startDatabase() throws Exception {
        POSTGRES.start();
        connection = DriverManager.getConnection(
                "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/namesearch",
                "postgres", "test");

        try (Statement statement = connection.createStatement()) {
            // The columns the search reads; the rest of the real table does not matter here.
            statement.execute("CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
                    + "first_name VARCHAR(100), last_name VARCHAR(100), is_active BOOLEAN DEFAULT TRUE)");
            statement.execute(readMigration());

            // Enough rows that an index is worth using, plus the people the assertions look for.
            statement.execute("INSERT INTO users (first_name, last_name) SELECT 'Name' || g, 'Family' || (g % 97) "
                    + "FROM generate_series(1, 20000) AS g");
            statement.execute("INSERT INTO users (first_name, last_name) VALUES "
                    + "('Tuấn Anh', 'Nguyễn'), ('Minh', 'Đặng'), ('Bao', 'Tran'), ('Binh', 'An'), ('Plain', 'Name')");
            statement.execute("ANALYZE users");
        }
    }

    @AfterAll
    static void stopDatabase() throws SQLException {
        if (connection != null) {
            connection.close();
        }
        POSTGRES.stop();
    }

    private static String readMigration() throws IOException {
        try (InputStream in = UserNameSearchPostgresTest.class.getClassLoader()
                .getResourceAsStream("db/changelog/changes/V090__users_name_search_unaccent_trigram.sql")) {
            assertThat(in).as("the V090 migration is on the classpath").isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    // ── Postgres's own unaccent rules ────────────────────────────────────────

    @Test
    void theFoldingWrapperDropsVietnameseAccents_includingD() throws Exception {
        assertThat(scalar("SELECT immutable_unaccent(lower('Nguyễn Đặng Tuấn Ơn Ư'))"))
                .isEqualTo("nguyen dang tuan on u");
    }

    // ── the SQL UserNameSearch builds, on Postgres ───────────────────────────

    @Test
    void theBuiltPredicateMatchesTheRightPeople() throws Exception {
        assertThat(names("tuan")).containsExactly("Tuấn Anh Nguyễn");
        assertThat(names("DANG")).containsExactly("Minh Đặng");
        assertThat(names("anh")).containsExactly("Tuấn Anh Nguyễn");     // a later word of the field
        assertThat(names("anh tu")).containsExactly("Tuấn Anh Nguyễn");  // every word, any order
        assertThat(names("an")).containsExactly("Binh An", "Tuấn Anh Nguyễn"); // "An" begins the last name (best match), "Anh" is a later word of the first name
        assertThat(names("ran")).isEmpty();                              // never the middle of a word
        assertThat(names("%")).isEmpty();                                // a typed wildcard is literal
        assertThat(names("_")).isEmpty();
    }

    // ── the trigram indexes serve both branches ──────────────────────────────

    @Test
    void theIndexesServeTheFieldStartAndTheLaterWordBranches() throws Exception {
        UserNameSearch.Predicate predicate = UserNameSearch.predicate("tuan");
        Bound bound = bind("SELECT u.id FROM users u WHERE " + predicate.where(), predicate.params());

        try (Statement statement = connection.createStatement()) {
            statement.execute("SET enable_seqscan = off");
        }
        StringBuilder plan = new StringBuilder();
        try (PreparedStatement explain = connection.prepareStatement("EXPLAIN " + bound.sql())) {
            for (int i = 0; i < bound.values().size(); i++) {
                explain.setString(i + 1, bound.values().get(i));
            }
            try (ResultSet rows = explain.executeQuery()) {
                while (rows.next()) {
                    plan.append(rows.getString(1)).append('\n');
                }
            }
        } finally {
            try (Statement statement = connection.createStatement()) {
                statement.execute("RESET enable_seqscan");
            }
        }

        assertThat(plan.toString())
                .contains("idx_users_first_name_search")
                .contains("idx_users_last_name_search")
                .doesNotContain("Seq Scan");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private record Bound(String sql, List<String> values) {
    }

    /** Turns the named {@code :wN} parameters into JDBC {@code ?} markers, collecting the values in order of appearance. */
    private static Bound bind(String sql, java.util.Map<String, Object> params) {
        Matcher matcher = Pattern.compile(":(w\\d+)").matcher(sql);
        List<String> values = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            values.add((String) params.get(matcher.group(1)));
            matcher.appendReplacement(out, "?");
        }
        matcher.appendTail(out);
        return new Bound(out.toString(), values);
    }

    /** The full names the real predicate and order return for a typed query, run on Postgres. */
    private static List<String> names(String query) throws SQLException {
        UserNameSearch.Predicate predicate = UserNameSearch.predicate(query);
        String order = predicate.first() == null ? "" : predicate.first() + ",";
        Bound bound = bind("SELECT trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) FROM users u WHERE u.is_active = true AND "
                + predicate.where() + " AND u.first_name NOT LIKE 'Name%' ORDER BY " + order + " u.first_name, u.last_name, u.id", predicate.params());
        List<String> result = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(bound.sql())) {
            for (int i = 0; i < bound.values().size(); i++) {
                statement.setString(i + 1, bound.values().get(i));
            }
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    result.add(rows.getString(1));
                }
            }
        }
        return result;
    }

    private static String scalar(String sql) throws SQLException {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getString(1);
        }
    }
}

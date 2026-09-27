package com.sportconnect.integration;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;

/**
 * Loads the <strong>real</strong> reference seed ({@code V073} + {@code V074}) into the H2 test schema, for integration
 * tests of domains that link to reference data (U16). The H2 {@code schema.sql} mirror deliberately carries no seed
 * rows, so what a test sees is the actual migration content: languages {@code en}/{@code vi}, Vietnam, its 63 regions
 * and Vietnam's default language {@code vi}.
 *
 * <p>Plain SQL scripts against {@link DataSource}, not repositories, so a test in another domain needs no dependency
 * on {@code reference-impl}'s entities just to prepare its fixtures.
 */
final class ReferenceTestData {

    private static final String SEED = "db/changelog/changes/V073__seed_reference_data.sql";
    private static final String DEFAULT_LANGUAGE = "db/changelog/changes/V074__add_default_language_to_countries.sql";

    private ReferenceTestData() {
    }

    /** Empties the reference tables (children first: {@code regions.country_id} is a real FK), then loads the seed. */
    static void reseed(DataSource dataSource) {
        clear(dataSource);
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new ClassPathResource(SEED), new ClassPathResource(DEFAULT_LANGUAGE));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
    }

    /** Removes every reference row, leaving the tables (owned by {@code schema.sql}) in place. */
    static void clear(DataSource dataSource) {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.addScript(new org.springframework.core.io.ByteArrayResource(
                ("DELETE FROM regions; DELETE FROM countries; DELETE FROM languages;").getBytes()));
        populator.execute(dataSource);
    }
}

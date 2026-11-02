package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthContributorRegistry;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * INFRA-11 counterpart of {@link MailHealthDisabledIntegrationTest}: with the default settings the mail check is part of
 * the health. It proves the property is what removes the check (and not, say, a missing mail sender in the test setup),
 * so the disabled test cannot pass for the wrong reason.
 */
class MailHealthEnabledIntegrationTest extends BaseIT {

    @Autowired
    private HealthContributorRegistry registry;

    @Test
    void mailCheckIsPartOfTheHealth_byDefault() {
        assertThat(registry.getContributor("mail")).isNotNull();
    }
}

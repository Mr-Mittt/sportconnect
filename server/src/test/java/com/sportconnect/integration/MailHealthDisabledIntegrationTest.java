package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthContributorRegistry;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * INFRA-11: the property the {@code prod} profile sets ({@code management.health.mail.enabled=false}) removes the mail
 * check from the health the server reports, so a mail outage cannot turn a prod server DOWN. The property is set here by
 * hand the way {@code application-prod.yml} sets it; {@code ProdProfileMailHealthSettingTest} pins that the prod file
 * carries it, and {@link MailHealthEnabledIntegrationTest} is the counterpart without it.
 */
@TestPropertySource(properties = "management.health.mail.enabled=false")
class MailHealthDisabledIntegrationTest extends BaseIT {

    @Autowired
    private HealthContributorRegistry registry;

    @Test
    void mailCheckIsNotPartOfTheHealth_whenSwitchedOff() {
        assertThat(registry.getContributor("mail")).isNull();
    }
}

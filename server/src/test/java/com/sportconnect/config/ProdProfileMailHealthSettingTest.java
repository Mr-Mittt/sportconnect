package com.sportconnect.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * INFRA-11: pins the real {@code application-prod.yml}. A deployed server must not report DOWN because its mail
 * provider is unreachable (the container health check and the deploy command would then roll back an unrelated
 * release); the effect of the switch is covered by {@code MailHealthIndicatorIntegrationTest}, this proves the prod file
 * actually sets it.
 */
class ProdProfileMailHealthSettingTest {

    @Test
    void prodProfile_keepsTheMailCheckOutOfTheOverallHealth() throws IOException {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("prod", new ClassPathResource("application-prod.yml"));

        assertThat(sources).isNotEmpty();
        PropertySource<?> prod = sources.get(0);
        assertThat(String.valueOf(prod.getProperty("management.health.mail.enabled"))).isEqualTo("false");
    }
}

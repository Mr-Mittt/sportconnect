package com.sportconnect.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * INFRA-10: pins the real {@code application-prod.yml}. A deployed server must not serve the Swagger UI or the OpenAPI
 * document; the behaviour of that switch is covered by {@code SwaggerExposureDisabledIntegrationTest}, this proves the
 * prod file actually sets it (the integration tests set the same two properties by hand).
 */
class ProdProfileSwaggerSettingTest {

    @Test
    void prodProfile_switchesSwaggerUiAndApiDocsOff() throws IOException {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("prod", new ClassPathResource("application-prod.yml"));

        assertThat(sources).isNotEmpty();
        PropertySource<?> prod = sources.get(0);
        assertThat(String.valueOf(prod.getProperty("springdoc.swagger-ui.enabled"))).isEqualTo("false");
        assertThat(String.valueOf(prod.getProperty("springdoc.api-docs.enabled"))).isEqualTo("false");
    }
}

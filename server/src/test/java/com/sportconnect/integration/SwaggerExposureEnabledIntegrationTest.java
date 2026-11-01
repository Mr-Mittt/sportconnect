package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * INFRA-10 counterpart of {@link SwaggerExposureDisabledIntegrationTest}: with the default settings (dev, tests) the
 * Swagger UI and the OpenAPI document are still served to an anonymous caller. It proves that the two springdoc flags are
 * what switches the paths off, and that the dev workflow (Swagger's Authorize at Keycloak) was not broken.
 */
class SwaggerExposureEnabledIntegrationTest extends BaseIT {

    @Test
    void apiDocs_isServedAnonymously_whenTheFeatureIsOn() throws Exception {
        MvcResult result = mockMvc.perform(get("/api-docs")).andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString()).contains("\"openapi\"");
    }

    @Test
    void swaggerUi_isReachableAnonymously_whenTheFeatureIsOn() throws Exception {
        MvcResult result = mockMvc.perform(get("/swagger-ui.html")).andReturn();

        // springdoc answers 302 to /swagger-ui/index.html; either way the filter chain let the caller through.
        assertThat(result.getResponse().getStatus()).isIn(200, 302);
    }
}

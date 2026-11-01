package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * INFRA-10: with springdoc switched off (what {@code application-prod.yml} does), the API catalogue is neither served
 * nor named as public. The two flags are set here the same way the prod profile sets them; {@link
 * ProdProfileSwaggerSettingTest} pins that the prod file really carries them.
 *
 * <p>The assertion is the filter chain's own 401, not "not 200": before INFRA-10 these paths were {@code permitAll} in
 * every profile, so with the feature off an anonymous call passed the filter chain and ended in a 404 from the
 * dispatcher. A 401 here proves the public list no longer names them.
 */
@TestPropertySource(properties = {
        "springdoc.api-docs.enabled=false",
        "springdoc.swagger-ui.enabled=false"
})
class SwaggerExposureDisabledIntegrationTest extends BaseIT {

    private static void assertRejectedByFilterChain(ResultActions actions) throws Exception {
        actions.andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Unauthorized")));
    }

    @Test
    void swaggerUiPaths_areRejectedByTheFilterChain_whenTheFeatureIsOff() throws Exception {
        for (String path : new String[] {"/swagger-ui.html", "/swagger-ui/index.html", "/swagger-ui/swagger-config"}) {
            assertRejectedByFilterChain(mockMvc.perform(get(path)));
        }
    }

    @Test
    void apiDocsPaths_areRejectedByTheFilterChain_whenTheFeatureIsOff() throws Exception {
        for (String path : new String[] {"/api-docs", "/api-docs/swagger-config", "/v3/api-docs"}) {
            assertRejectedByFilterChain(mockMvc.perform(get(path)));
        }
    }
}

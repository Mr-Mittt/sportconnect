package com.sportconnect.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers a named {@code bearerAuth} HTTP-bearer security scheme (matching
 * {@code JwtAuthenticationFilter}'s {@code Authorization: Bearer <token>} convention exactly) and
 * applies it as the API-wide default {@link SecurityRequirement}. Individual public endpoints
 * opt out per-method with {@code @SecurityRequirements()} rather than every protected endpoint
 * having to opt in — a missed opt-out only shows an unnecessary padlock in Swagger UI, whereas a
 * missed opt-in would silently document a protected endpoint as public.
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME_NAME = "bearerAuth";

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("SportConnect API")
                        .description("Social sports community platform — auth, user profiles, sports, "
                                + "social feed, and groups.")
                        .version("0.0.1-SNAPSHOT"))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME_NAME, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME_NAME));
    }
}

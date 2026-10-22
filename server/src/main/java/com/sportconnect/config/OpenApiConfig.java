package com.sportconnect.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.OAuthFlow;
import io.swagger.v3.oas.models.security.OAuthFlows;
import io.swagger.v3.oas.models.security.Scopes;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI definition for Swagger UI.
 *
 * <p>A28: registers a named {@code keycloak} security scheme using OAuth2's Authorization Code flow (with PKCE) against
 * the realm and applies it as the API-wide default {@link SecurityRequirement}. Swagger UI's Authorize dialog sends the
 * browser to Keycloak's login page (the themed one, so Google/Facebook/Zalo work here too), then attaches the access
 * token as {@code Authorization: Bearer <access_token>} to every "Try it out" call. The realm client behind it is
 * {@code sportconnect-swagger} (`infra/scripts/realm-swagger-client.mjs`); the client id and PKCE are set in
 * {@code application.yml} under {@code springdoc.swagger-ui.oauth}. It replaces the pre-Keycloak {@code /api/auth/oauth-token}
 * password bridge, which handed out tokens nothing accepts since A25.
 *
 * <p>The URLs are the issuer's public address ({@code app.keycloak.issuer-uri}) because the browser, not the backend,
 * calls them. Individual public endpoints opt out per-method with {@code @SecurityRequirements()} rather than every
 * protected endpoint having to opt in -- a missed opt-out only shows an unnecessary padlock in Swagger UI, whereas a
 * missed opt-in would silently document a protected endpoint as public.
 */
@Configuration
public class OpenApiConfig {

    private static final String OAUTH2_SCHEME_NAME = "keycloak";

    @Value("${app.keycloak.issuer-uri}")
    private String issuerUri;

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("SportConnect API")
                        .description("Social sports community platform — auth, user profiles, sports, "
                                + "social feed, and groups.")
                        .version("0.0.1-SNAPSHOT"))
                .components(new Components()
                        .addSecuritySchemes(OAUTH2_SCHEME_NAME, new SecurityScheme()
                                .type(SecurityScheme.Type.OAUTH2)
                                .description("Sign in at Keycloak (Authorization Code with PKCE); the access token is attached to every request.")
                                .flows(new OAuthFlows()
                                        .authorizationCode(new OAuthFlow()
                                                .authorizationUrl(issuerUri + "/protocol/openid-connect/auth")
                                                .tokenUrl(issuerUri + "/protocol/openid-connect/token")
                                                .scopes(new Scopes().addString("openid", "OpenID Connect"))))))
                .addSecurityItem(new SecurityRequirement().addList(OAUTH2_SCHEME_NAME));
    }
}

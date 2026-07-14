package com.sportconnect.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.OAuthFlow;
import io.swagger.v3.oas.models.security.OAuthFlows;
import io.swagger.v3.oas.models.security.Scopes;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers a named {@code oauth2Password} security scheme using OAuth2's "password" flow and
 * applies it as the API-wide default {@link SecurityRequirement}. This is a Swagger-UI-only
 * convenience, not a real OAuth2 integration — the app has no OAuth2 server anywhere else.
 * Swagger UI's Authorize dialog for this flow shows plain username/password fields; on submit it
 * POSTs {@code grant_type=password&username=&password=} as {@code
 * application/x-www-form-urlencoded} to {@code tokenUrl} below and expects the standard {@code
 * {access_token, token_type, expires_in}} shape back, which it then auto-attaches as {@code
 * Authorization: Bearer <access_token>} to every subsequent "Try it out" call — functionally
 * identical to the previous plain-bearer scheme once authorized, just without the manual
 * login-then-copy-paste step. {@link com.sportconnect.auth.controller.SwaggerOAuth2TokenController}
 * ({@code auth-impl}) is the translation layer behind {@code tokenUrl}, delegating to the same
 * {@code AuthService.login} the real {@code /api/auth/login} endpoint uses — the real API's own
 * auth mechanism ({@code JwtAuthenticationFilter}, bearer tokens on every protected endpoint) is
 * completely unchanged by this.
 *
 * <p>Individual public endpoints opt out per-method with {@code @SecurityRequirements()} rather
 * than every protected endpoint having to opt in — a missed opt-out only shows an unnecessary
 * padlock in Swagger UI, whereas a missed opt-in would silently document a protected endpoint as
 * public. That convention is unaffected by the scheme change.
 */
@Configuration
public class OpenApiConfig {

    private static final String OAUTH2_SCHEME_NAME = "oauth2Password";

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
                                .description("Authorize with your account email + password "
                                        + "(sent as OAuth2 'password' grant fields under the hood).")
                                .flows(new OAuthFlows()
                                        .password(new OAuthFlow()
                                                .tokenUrl("/api/auth/oauth-token")
                                                .scopes(new Scopes())))))
                .addSecurityItem(new SecurityRequirement().addList(OAUTH2_SCHEME_NAME));
    }
}

package com.sportconnect.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * A25: the decoder that verifies a Keycloak access token: RS256 signature against the realm JWKS, {@code exp}/{@code nbf},
 * the exact issuer, and an audience containing this API. The key set is fetched lazily on the first token and cached by
 * Nimbus (re-fetched when an unknown {@code kid} shows up), so the application boots with Keycloak down.
 */
@Configuration
@RequiredArgsConstructor
public class KeycloakJwtConfig {

    private final KeycloakProperties properties;

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(properties.getJwkSetUri())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.getIssuerUri()),
                audienceValidator(properties.getAudience())));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String requiredAudience) {
        OAuth2Error error = new OAuth2Error("invalid_token", "The required audience is missing", null);
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(requiredAudience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }
}

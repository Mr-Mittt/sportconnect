package com.sportconnect.auth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * A25: where the access tokens come from. {@code issuerUri} must equal the token's {@code iss} exactly (Keycloak
 * stamps its public hostname there), while {@code jwkSetUri} is only where the keys are fetched from, so it can be an
 * internal address.
 */
@Configuration
@ConfigurationProperties(prefix = "app.keycloak")
@Getter
@Setter
public class KeycloakProperties {

    private String issuerUri;
    private String jwkSetUri;
    /** The {@code aud} value this API requires; the realm's audience mapper adds it to every access token. */
    private String audience = "sportconnect-api";
}

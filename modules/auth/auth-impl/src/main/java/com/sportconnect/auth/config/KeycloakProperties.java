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

    /** A26: the public client the web app signs in with; the backend completes its Authorization Code + PKCE flow. */
    private String clientId = "sportconnect-web";
    /** A26: the {@code redirect_uri} the client sent on the authorization request; the code exchange must repeat it exactly. */
    private String redirectUri;
    /** A26: the realm's token endpoint (code exchange and refresh). Server to server, so it can be an internal address. */
    private String tokenUri;
    /** A26: the realm's end-session endpoint; a POST with the refresh token ends the SSO session. */
    private String logoutUri;
}

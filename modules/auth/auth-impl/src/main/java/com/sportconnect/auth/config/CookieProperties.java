package com.sportconnect.auth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Controls the {@code Secure} attribute on the refresh-token cookie (see {@code AuthController}).
 * Defaults to {@code true} (safe for production over HTTPS); the dev profile overrides it to
 * {@code false} so the cookie is still stored when the client (Vite, http://localhost:5173) talks
 * to the API over plain HTTP locally — browsers silently drop a {@code Secure} cookie set over
 * HTTP, so this must not default to {@code false} anywhere but local dev.
 */
@Configuration
@ConfigurationProperties(prefix = "app.cookie")
@Getter
@Setter
public class CookieProperties {

    private boolean secure = true;
}

package com.sportconnect.auth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.jwt")
@Getter
@Setter
public class JwtProperties {

    private String secret;
    private Long expiration;
    private Long refreshExpiration;

    /**
     * A12: how long, in milliseconds, the "never revoked" marker is cached in Redis. Deliberately much shorter
     * than {@link #expiration}: a stale marker is the only cache value that can wrongly let a revoked token
     * through, so this bounds how long a request racing a logout can leave one behind.
     */
    private long revocationSentinelTtl = 5_000L;
}

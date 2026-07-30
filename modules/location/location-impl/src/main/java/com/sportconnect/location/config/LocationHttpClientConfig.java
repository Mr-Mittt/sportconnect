package com.sportconnect.location.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;
import java.time.Duration;

/**
 * HttpClient used only by {@link com.sportconnect.location.service.GoogleMapsUrlResolver} to
 * resolve short Google Maps share links (maps.app.goo.gl). Redirects are followed manually
 * (never automatically) so each hop's target host can be checked against the allowlist before
 * it's followed.
 */
@Configuration
public class LocationHttpClientConfig {

    @Bean
    public HttpClient googleMapsHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }
}

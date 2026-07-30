package com.sportconnect.location.service;

import com.sportconnect.common.exception.BadRequestException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts coordinates from a user-pasted Google Maps URL. Full/expanded URLs are parsed
 * entirely by regex, no network call. Short share links (maps.app.goo.gl, goo.gl) don't contain
 * coordinates until resolved, so those require following the redirect chain server-side (a
 * browser can't do this itself — CORS blocks reading a cross-origin redirect's target).
 *
 * <p>This is a real SSRF surface if built loosely: {@link #ALLOWED_HOSTS} is checked against the
 * initial URL AND every redirect hop before it's followed — anything off-list is rejected
 * immediately rather than fetched.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleMapsUrlResolver {

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "google.com", "www.google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl");
    private static final Set<String> SHORT_LINK_HOSTS = Set.of("goo.gl", "maps.app.goo.gl");
    private static final int MAX_REDIRECTS = 3;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(3);

    // Precise place pin, e.g. ...!3d37.4224764!4d-122.0842499...
    private static final Pattern PRECISE_PIN = Pattern.compile("!3d(-?\\d+\\.\\d+)!4d(-?\\d+\\.\\d+)");
    // Viewport center, e.g. .../@37.4224764,-122.0842499,17z
    private static final Pattern VIEWPORT_CENTER = Pattern.compile("@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)");
    // Query-param form, e.g. ?q=37.4224764,-122.0842499
    private static final Pattern QUERY_PARAM = Pattern.compile("[?&]q=(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)");
    // Place name segment, e.g. /maps/place/Some+Place/@...
    private static final Pattern PLACE_NAME = Pattern.compile("/maps/place/([^/@]+)");

    private final HttpClient httpClient;

    public Resolved resolve(String rawUrl) {
        URI uri = parseUri(rawUrl);
        String host = requireAllowedHost(uri);

        String resolvedUrl = rawUrl;
        Coordinates coordinates = extractCoordinates(rawUrl);

        if (coordinates == null && SHORT_LINK_HOSTS.contains(host)) {
            resolvedUrl = followRedirects(uri);
            coordinates = extractCoordinates(resolvedUrl);
        }

        String suggestedName = extractSuggestedName(resolvedUrl);
        return new Resolved(
                coordinates != null ? coordinates.latitude() : null,
                coordinates != null ? coordinates.longitude() : null,
                suggestedName);
    }

    private URI parseUri(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            if (uri.getHost() == null) {
                throw new BadRequestException("Not a valid URL");
            }
            return uri;
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Not a valid URL");
        }
    }

    private String requireAllowedHost(URI uri) {
        String host = uri.getHost().toLowerCase();
        if (!ALLOWED_HOSTS.contains(host)) {
            throw new BadRequestException("Only Google Maps URLs are supported");
        }
        return host;
    }

    Coordinates extractCoordinates(String url) {
        Matcher precise = PRECISE_PIN.matcher(url);
        if (precise.find()) {
            return new Coordinates(Double.parseDouble(precise.group(1)), Double.parseDouble(precise.group(2)));
        }
        Matcher viewport = VIEWPORT_CENTER.matcher(url);
        if (viewport.find()) {
            return new Coordinates(Double.parseDouble(viewport.group(1)), Double.parseDouble(viewport.group(2)));
        }
        Matcher query = QUERY_PARAM.matcher(url);
        if (query.find()) {
            return new Coordinates(Double.parseDouble(query.group(1)), Double.parseDouble(query.group(2)));
        }
        return null;
    }

    String extractSuggestedName(String url) {
        Matcher matcher = PLACE_NAME.matcher(url);
        if (!matcher.find()) {
            return null;
        }
        String raw = matcher.group(1).replace('+', ' ').replace('-', ' ');
        try {
            return URLDecoder.decode(raw, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return raw;
        }
    }

    /**
     * Follows the redirect chain up to {@link #MAX_REDIRECTS} hops, verifying every hop's target
     * host against {@link #ALLOWED_HOSTS} before following it. Falls back to returning whatever
     * URL was last reached (never throws) — the caller treats a still-unresolved URL as "no
     * coordinates found" rather than a hard error.
     */
    private String followRedirects(URI startUri) {
        URI currentUri = startUri;
        for (int hop = 0; hop < MAX_REDIRECTS; hop++) {
            // Check before fetching — a redirect target may already carry coordinates in its
            // own URL, in which case there's no need to fetch it at all (it may not even be a
            // further redirect).
            if (extractCoordinates(currentUri.toString()) != null) {
                return currentUri.toString();
            }

            HttpResponse<Void> response;
            try {
                HttpRequest request = HttpRequest.newBuilder(currentUri)
                        .timeout(REQUEST_TIMEOUT)
                        .GET()
                        .build();
                response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                log.warn("Failed to resolve Google Maps short link {}: {}", currentUri, e.getMessage());
                return currentUri.toString();
            }

            int status = response.statusCode();
            if (status < 300 || status >= 400) {
                return currentUri.toString();
            }

            String locationHeader = response.headers().firstValue("Location").orElse(null);
            if (locationHeader == null) {
                return currentUri.toString();
            }

            URI nextUri = currentUri.resolve(locationHeader);
            String nextHost = nextUri.getHost();
            if (nextHost == null || !ALLOWED_HOSTS.contains(nextHost.toLowerCase())) {
                log.warn("Refusing to follow redirect from {} to disallowed host {}", currentUri, nextHost);
                return currentUri.toString();
            }
            currentUri = nextUri;
        }
        return currentUri.toString();
    }

    record Coordinates(double latitude, double longitude) {
    }

    public record Resolved(Double latitude, Double longitude, String suggestedName) {
    }
}

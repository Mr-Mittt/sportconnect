package com.sportconnect.auth.config;

import com.sportconnect.auth.security.InternalServiceAuthFilter;
import com.sportconnect.auth.security.JwtAuthenticationEntryPoint;
import com.sportconnect.auth.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;

    @Value("${app.internal-service-secret}")
    private String internalServiceSecret;

    @Value("${app.cors.allowed-origins}")
    private String corsAllowedOrigins;

    @Value("${app.cors.allowed-methods}")
    private String corsAllowedMethods;

    @Value("${app.cors.allowed-headers}")
    private String corsAllowedHeaders;

    @Value("${app.cors.allow-credentials}")
    private boolean corsAllowCredentials;

    /**
     * Service-to-service traffic only ({@code /internal/**} — services/chat's cold-start
     * bootstrap pull, see services/chat/docs/SYNC_DESIGN.md). Deliberately a separate chain from
     * the JWT-authenticated one below, not an entry in its {@code permitAll} list — this is not
     * user authentication, and must never be reachable from outside the Docker network in prod
     * (an infra/reverse-proxy concern, not enforceable here). {@code @Order(1)} makes Spring
     * Security evaluate this chain's {@code securityMatcher} first.
     * <p>
     * {@link InternalServiceAuthFilter} is constructed directly here, never as a
     * {@code @Component} — see that class's Javadoc for why: a bean implementing {@code Filter}
     * gets auto-registered by Spring Boot as a global servlet filter regardless of which
     * {@code SecurityFilterChain} it's added to, which would apply this filter's rejection to
     * every request in the app, not just {@code /internal/**} ones.
     */
    @Bean
    @Order(1)
    public SecurityFilterChain internalSyncFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/internal/**")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .addFilterBefore(new InternalServiceAuthFilter(internalServiceSecret), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exception -> exception.authenticationEntryPoint(jwtAuthenticationEntryPoint))
                .authorizeHttpRequests(auth -> auth
                        // Logout must be authenticated (derives the user from the principal, see
                        // AuthController). It is not in the explicit permit list below, so it falls
                        // through to authenticated either way; the rule stays to state the intent.
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").authenticated()

                        // A7: the public auth surface is an explicit list, not "/api/auth/**" — a new
                        // endpoint added under /api/auth must be a conscious permitAll here, otherwise it
                        // defaults to authenticated. Everything below is reachable without a token because
                        // the caller has none yet (or, for oauth-token, is Swagger UI's Authorize button
                        // logging in — same exposure as /login; its deployed-environment question is
                        // INFRA-10).
                        .requestMatchers(HttpMethod.POST,
                                "/api/auth/register",
                                "/api/auth/login",
                                // A9: confirms a re-activation after login answered ACCOUNT_DEACTIVATED; the caller
                                // has no token (it was withheld), and the credentials are re-verified in the handler.
                                "/api/auth/reactivate",
                                "/api/auth/refresh",
                                "/api/auth/verify-email",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password",
                                "/api/auth/oauth-token").permitAll()
                        // A7: nothing under /api/sports is public any more (it was a blanket permitAll
                        // since the initial commit, with the real gating left to @PreAuthorize — which
                        // answered an anonymous caller 403 instead of 401). The catalogue reads
                        // (GET /api/sports, /{id}, /category/{c}) have no anonymous caller: the only
                        // anonymous client routes are /login and /register, and signup logs the user in
                        // before sport selection. The A21/A22 caller-scoped profile matchers that used to
                        // sit here are covered by anyRequest().authenticated() below.

                        // REF-1: languages / countries / regions are public, read-only reference data — the
                        // sign-up form needs its dropdowns before an account exists. GET only, plus the one
                        // exact POST below. Ordered before anyRequest (first-match-wins).
                        .requestMatchers(HttpMethod.GET, "/api/reference/**").permitAll()
                        // REF-2: the sign-up pre-fill sends browser signals (locales, timezone, optionally
                        // coordinates) and gets reference rows back. A POST only because it carries a body; it
                        // is read-only and identity-free. Deliberately the one exact path, not /api/reference/**
                        // for POST — any other POST under it must stay authenticated.
                        .requestMatchers(HttpMethod.POST, "/api/reference/resolve").permitAll()
                        // U11: no longer public — every GET under /api/users/** now either already
                        // had its own @PreAuthorize (search, friends/**, me/preferences) or gained
                        // one this ticket (the id/email/username lookups, the check/* endpoints,
                        // and the new /me). Nothing anonymous remains under this path.
                        // A7: hashtag reads (trending, suggest, posts-by-hashtag) are authenticated too —
                        // no anonymous client route calls them, and every other feed already requires a JWT.

                        // Static resources (images, etc.)
                        .requestMatchers("/images/**").permitAll()

                        // NTF-3: STOMP live-delivery WebSocket handshake. The HTTP upgrade request
                        // itself carries no auth (a browser's native WebSocket handshake can't set
                        // custom headers) — real auth happens at the STOMP CONNECT frame via
                        // StompAuthChannelInterceptor (notification-impl), which reads the JWT off
                        // the frame's own Authorization header instead.
                        .requestMatchers("/ws/**").permitAll()

                        // Swagger/OpenAPI — /api-docs is this app's customized springdoc path
                        // (see application.yml); /v3/api-docs is the springdoc default, kept
                        // permitted too in case the customization is ever reverted.
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/api-docs/**", "/v3/api-docs/**").permitAll()

                        // Health check
                        .requestMatchers("/actuator/health").permitAll()

                        // All other requests require authentication
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Reads every value from {@code app.cors.*} (application.yml, overridable per-profile or via
     * the {@code CORS_ORIGINS} env var) — previously this hardcoded its own origin/method/header
     * list in Java, silently ignoring those properties entirely (they were dead config: setting
     * {@code CORS_ORIGINS} never actually changed anything). {@code setAllowedOriginPatterns},
     * not {@code setAllowedOrigins}, so a dev-profile entry can use a {@code *} wildcard (e.g. for
     * a phone reaching the Vite dev server over LAN) — {@code setAllowedOrigins} requires an exact
     * string match and additionally forbids {@code *} outright once {@code allowCredentials} is
     * true, which this app always needs for the refresh-token cookie.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(splitCsv(corsAllowedOrigins));
        configuration.setAllowedMethods(splitCsv(corsAllowedMethods));
        configuration.setAllowedHeaders(splitCsv(corsAllowedHeaders));
        configuration.setAllowCredentials(corsAllowCredentials);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private static List<String> splitCsv(String csv) {
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toList();
    }
}

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
                        // AuthController) — ordered before the broader /api/auth/** permit below
                        // since Spring Security uses first-match-wins.
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout").authenticated()

                        // Public endpoints
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers("/api/sports/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/users/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/hashtags/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/posts/hashtag/**").permitAll()

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

package com.sportconnect.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.io.PrintWriter;

/**
 * Gates every {@code /internal/**} request behind a shared static secret — this is
 * service-to-service traffic (services/chat's cold-start bootstrap pull, see
 * services/chat/docs/SYNC_DESIGN.md), never a user, so it's a deliberately separate mechanism
 * from {@link JwtAuthenticationFilter} rather than reusing the JWT chain. Wired into its own
 * {@code SecurityFilterChain} bean in {@link com.sportconnect.auth.config.SecurityConfig},
 * scoped to {@code /internal/**} only.
 * <p>
 * Deliberately <b>not</b> a {@code @Component}/Spring bean — Spring Boot auto-registers any bean
 * implementing {@code Filter} (which {@link OncePerRequestFilter} does) as a global servlet
 * filter applied to <i>every</i> request, completely independent of which
 * {@code SecurityFilterChain}'s {@code addFilterBefore(...)} it's wired into. That auto-registered
 * copy would run ahead of the {@code /internal/**}-scoped one and reject every request in the
 * app, not just internal ones — this was a real, live bug during initial rollout. Constructing
 * this directly in {@link com.sportconnect.auth.config.SecurityConfig} (never as a bean) is what
 * keeps it scoped to exactly the one chain it's added to.
 */
public class InternalServiceAuthFilter extends OncePerRequestFilter {

    private static final String HEADER_NAME = "X-Internal-Service-Secret";

    private final String expectedSecret;

    public InternalServiceAuthFilter(String expectedSecret) {
        this.expectedSecret = expectedSecret;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String provided = request.getHeader(HEADER_NAME);

        if (!StringUtils.hasText(expectedSecret) || !expectedSecret.equals(provided)) {
            // Writing the body directly rather than response.sendError(...): sendError triggers
            // the servlet container's default error-page dispatch, which re-enters Spring
            // Security as a fresh request to /error — a path this filter's own chain doesn't
            // cover, so it falls through to the main chain's JwtAuthenticationEntryPoint and
            // silently becomes a generic 401 "Full authentication is required" instead of this
            // filter's own 403. No data is ever leaked either way, but writing the response body
            // ourselves keeps the intended status/message from being overridden.
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            try (PrintWriter writer = response.getWriter()) {
                writer.write("{\"error\":\"forbidden\",\"message\":\"Invalid or missing internal service secret\"}");
            }
            return;
        }

        filterChain.doFilter(request, response);
    }
}
